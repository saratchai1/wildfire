"""Run unchanged previous assertions against their preserved forward.html entrypoint.
Only the two root navigation URLs are remapped; planning/v1, assertions and scripts remain intact.
"""
from pathlib import Path
for name in ['console_browser.py','north_browser.py']:
    path=Path('tests')/name
    source=path.read_text(encoding='utf-8')
    source=source.replace("page.goto('http://127.0.0.1:4173/',", "page.goto('http://127.0.0.1:4173/forward.html',")
    source=source.replace("'http://127.0.0.1:4173/#principles'", "'http://127.0.0.1:4173/forward.html#principles'")
    exec(compile(source,str(path),'exec'),{'__name__':'__main__','__file__':str(path)})
