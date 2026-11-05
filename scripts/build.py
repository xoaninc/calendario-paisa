#!/usr/bin/env python3
"""Construye la web a partir del calendario de clase publicado en Outlook.

    ICS_URL=https://… python3 scripts/build.py            # descarga el calendario
    python3 scripts/build.py --ics calendario.ics          # usa un fichero local

Deja en _site/ la web (lo que hay en web/), eventos.json y una copia del
calendario en calendario.ics para suscribirse.
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import shutil
import sys
import urllib.request
from zoneinfo import ZoneInfo

MAD = ZoneInfo('Europe/Madrid')
ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
MIN_EVENTS = 50  # por debajo de esto el calendario ha llegado mal: no se publica

BOILERPLATE = re.compile(r'\s*Calendario no oficial de 1º de Paisajismo.*?profesores\.', re.S)
AULA_VIRTUAL = re.compile(r'\s*Aula Virtual: (\S+)\s*$')
SOURCE = re.compile(r'\s*Fuente: (.+?)\s*$', re.S)
KIND = re.compile(r'\s*Tipo: ([^\n]+?)\.?\s*$')
SUBJECT = re.compile(r'^([A-Z]+(?:\+[A-Z]+)*) · ')
# Tipo de la Agenda (lo pone public_cal.py en la descripción) → etiqueta de la web; clases y talleres no llevan
KIND_TAG = {'Entrega': 'entrega', 'Examen': 'examen', 'Presentación': 'presentacion',
            'Visita': 'visita', 'Sin clase': 'sinclase'}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'calendario-paisa (GitHub Actions)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def unescape(value):
    return re.sub(r'\\([\\;,nN])', lambda m: '\n' if m.group(1) in 'nN' else m.group(1), value)


def raw_events(text):
    """VEVENT → {PROPIEDAD: (parámetros, valor)}; ignora VTIMEZONE y el resto."""
    text = re.sub(r'\r?\n[ \t]', '', text)  # desdoblar líneas
    events, cur = [], None
    for line in text.splitlines():
        if line == 'BEGIN:VEVENT':
            cur = {}
        elif line == 'END:VEVENT':
            events.append(cur)
            cur = None
        elif cur is not None and ':' in line:
            head, value = line.split(':', 1)
            name, *params = head.split(';')
            cur[name.upper()] = (dict(p.split('=', 1) for p in params if '=' in p), value)
    return events


def parse_when(params, value):
    """Devuelve (texto ISO local de Madrid, es_de_día_entero)."""
    if params.get('VALUE') == 'DATE' or re.fullmatch(r'\d{8}', value):
        return f'{value[:4]}-{value[4:6]}-{value[6:8]}', True
    d = dt.datetime.strptime(value[:15], '%Y%m%dT%H%M%S')
    if value.endswith('Z'):
        d = d.replace(tzinfo=dt.timezone.utc).astimezone(MAD).replace(tzinfo=None)
    # Con TZID, Outlook usa nombres de Windows ("Romance Standard Time"): es la hora de Madrid tal cual
    return d.strftime('%Y-%m-%dT%H:%M'), False


def tags(title, kind=None):
    t = title.lower()
    out = ['obligatoria'] if 'obligatoria' in t else []
    if kind in KIND_TAG:
        return out + [KIND_TAG[kind]]
    if kind:
        return out  # Clase o Taller
    # Sin tipo en la descripción: se adivina por el título
    if 'no hay clase' in t or 'sin clase' in t:
        return out + ['sinclase']
    if re.search(r'convocatoria|prueba escrita', t):
        out.append('examen')
    elif re.search(r'entrega|tarea del aula virtual|preguntas de examen', t):
        out.append('entrega')
    elif 'examen' in t:
        out.append('examen')
    if re.search(r'\b(visita|salida)\b', t):
        out.append('visita')
    if re.search(r'\bpresentaci(ón|ones)\b', t) and 'entrega' not in out:  # no «representación»
        out.append('presentacion')
    return out


def build_event(raw):
    title = unescape(raw.get('SUMMARY', ({}, ''))[1]).strip()
    start, all_day = parse_when(*raw['DTSTART'])
    end = parse_when(*raw['DTEND'])[0] if 'DTEND' in raw else start
    desc = unescape(raw.get('DESCRIPTION', ({}, ''))[1])

    url = key = None
    m = AULA_VIRTUAL.search(desc)
    if m:
        url, _, key = m.group(1).partition('#')
        desc = desc[:m.start()]
    desc = BOILERPLATE.sub('', desc).strip()
    source = None
    m = SOURCE.search(desc)
    if m:
        source = m.group(1).rstrip('.')
        desc = desc[:m.start()].strip()
    kind = None
    m = KIND.search(desc)
    if m:
        kind = m.group(1)
        desc = desc[:m.start()].strip()

    subjects = []
    m = SUBJECT.match(title)
    if m:
        subjects = m.group(1).split('+')
        title = title[m.end():]
    group = None
    m = re.search(r'\(Grupo ([12])\)', title)
    if m:
        group = int(m.group(1))

    return {
        'id': key or unescape(raw.get('UID', ({}, ''))[1]),
        'title': title,
        'subjects': subjects,
        'start': start,
        'end': end,
        'allDay': all_day,
        'location': unescape(raw.get('LOCATION', ({}, ''))[1]).strip(),
        'description': desc,
        'source': source,
        'url': url,
        'group': group,
        'kind': kind,
        'tags': tags(title, kind),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ics', help='fichero .ics local en vez de descargarlo de ICS_URL')
    ap.add_argument('--out', default=str(ROOT / '_site'))
    args = ap.parse_args()

    if args.ics:
        data = pathlib.Path(args.ics).read_bytes()
    else:
        url = os.environ.get('ICS_URL')
        if not url:
            sys.exit('Falta ICS_URL (secreto del repositorio) o --ics')
        data = fetch(url)

    text = data.decode('utf-8', errors='replace')
    name = re.search(r'^X-WR-CALNAME:(.*)$', text, re.M)
    events = sorted((build_event(e) for e in raw_events(text) if 'DTSTART' in e),
                    key=lambda e: (e['start'], e['title']))
    if len(events) < MIN_EVENTS:
        sys.exit(f'Solo hay {len(events)} eventos: algo ha fallado y no se publica')

    out = pathlib.Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(WEB, out)
    (out / 'calendario.ics').write_bytes(data)
    (out / 'eventos.json').write_text(json.dumps({
        'name': unescape(name.group(1)).strip() if name else 'Calendario de clase',
        'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'events': events,
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(events)} eventos → {out}')


if __name__ == '__main__':
    main()
