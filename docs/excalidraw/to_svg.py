"""Convertit les fichiers .excalidraw de ce dossier en SVG statiques.

Rendu simplifié (pas de style "sketchy" rough.js) : formes nettes, couleurs et
textes fidèles à la scène Excalidraw. Limité aux types d'éléments réellement
utilisés dans ces fichiers : rectangle, line, arrow, text.

Usage : python docs/excalidraw/to_svg.py
Régénère les SVG dans static/img/excalidraw/ à chaque modification d'un .excalidraw.
"""
import json
import os

SRC_DIR = os.path.dirname(__file__)
OUT_DIR = os.path.join(SRC_DIR, '..', '..', 'static', 'img', 'excalidraw')

FONT_FAMILIES = {
    1: "'Patrick Hand', cursive",
    2: "'Helvetica Neue', Arial, sans-serif",
    3: "'Cascadia Code', 'Courier New', monospace",
}


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def bbox(elements):
    xs, ys = [], []
    for e in elements:
        xs += [e['x'], e['x'] + e['width']]
        ys += [e['y'], e['y'] + e['height']]
    pad = 24
    return min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad


def render_rectangle(e):
    radius = min(e['width'], e['height']) * 0.12 if e.get('roundness') else 0
    radius = min(radius, 16)
    fill = e['backgroundColor'] if e['backgroundColor'] != 'transparent' else 'none'
    opacity = e.get('opacity', 100) / 100
    return (f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" height="{e["height"]}" '
            f'rx="{radius}" fill="{fill}" fill-opacity="{opacity}" '
            f'stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}" stroke-opacity="{opacity}"/>')


def render_line_or_arrow(e):
    pts = [(e['x'] + p[0], e['y'] + p[1]) for p in e['points']]
    path = ' '.join(f'{x},{y}' for x, y in pts)
    opacity = e.get('opacity', 100) / 100
    marker_end = f' marker-end="url(#arrowhead-{e["strokeColor"].lstrip("#")})"' if e.get('endArrowhead') == 'arrow' else ''
    marker_start = f' marker-start="url(#arrowhead-{e["strokeColor"].lstrip("#")})"' if e.get('startArrowhead') == 'arrow' else ''
    out = (f'<polyline points="{path}" fill="none" stroke="{e["strokeColor"]}" '
           f'stroke-width="{e["strokeWidth"]}" stroke-opacity="{opacity}"{marker_start}{marker_end}/>')
    for arrowhead, (x, y) in ((e.get('startArrowhead'), pts[0]), (e.get('endArrowhead'), pts[-1])):
        if arrowhead == 'dot':
            out += f'<circle cx="{x}" cy="{y}" r="{e["strokeWidth"] * 2.5}" fill="{e["strokeColor"]}" fill-opacity="{opacity}"/>'
    return out


def render_text(e):
    opacity = e.get('opacity', 100) / 100
    anchor = {'left': 'start', 'center': 'middle', 'right': 'end'}.get(e.get('textAlign'), 'start')
    anchor_x = {'start': e['x'], 'middle': e['x'] + e['width'] / 2, 'end': e['x'] + e['width']}[anchor]
    font_size = e['fontSize']
    line_height = e.get('lineHeight', 1.25) * font_size
    baseline = e['y'] + font_size * 0.85
    font_family = FONT_FAMILIES.get(e.get('fontFamily'), FONT_FAMILIES[2])
    lines = e['text'].split('\n')
    tspans = ''.join(
        f'<tspan x="{anchor_x}" y="{baseline + i * line_height}">{esc(line)}</tspan>'
        for i, line in enumerate(lines)
    )
    return (f'<text font-family="{font_family}" font-size="{font_size}" text-anchor="{anchor}" '
            f'fill="{e["strokeColor"]}" fill-opacity="{opacity}">{tspans}</text>')


RENDERERS = {
    'rectangle': render_rectangle,
    'line': render_line_or_arrow,
    'arrow': render_line_or_arrow,
    'text': render_text,
}


def convert(path):
    with open(path, encoding='utf-8') as f:
        scene = json.load(f)
    elements = [e for e in scene['elements'] if not e.get('isDeleted')]
    x, y, w, h = bbox(elements)

    colors = {e['strokeColor'] for e in elements if e['type'] in ('line', 'arrow') and e.get('endArrowhead') == 'arrow'}
    markers = ''.join(
        f'<marker id="arrowhead-{c.lstrip("#")}" markerWidth="10" markerHeight="10" '
        f'refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
        for c in colors
    )

    body = ''.join(RENDERERS[e['type']](e) for e in elements if e['type'] in RENDERERS)
    bg = scene.get('appState', {}).get('viewBackgroundColor', '#ffffff')

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" '
           f'width="{w}" height="{h}">'
           f'<defs>{markers}</defs>'
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>'
           f'{body}</svg>')
    return svg


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in os.listdir(SRC_DIR):
        if not name.endswith('.excalidraw'):
            continue
        svg = convert(os.path.join(SRC_DIR, name))
        out_path = os.path.join(OUT_DIR, name.replace('.excalidraw', '.svg'))
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(svg)
        print(f'-> {out_path}')


if __name__ == '__main__':
    main()
