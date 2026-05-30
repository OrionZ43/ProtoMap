with open('src/lib/client/audioManager.ts', 'r') as f:
    content = f.read()

# Expand SoundName type
type_old = """export type SoundName =
    | 'click'
    | 'success'
    | 'fail'
    | 'message'
    | 'click_alt'
    | 'popup_open'
    | 'popup_close'
    | 'entercasino';"""

type_new = """export type SoundName =
    | 'click'
    | 'success'
    | 'fail'
    | 'message'
    | 'click_alt'
    | 'popup_open'
    | 'popup_close'
    | 'entercasino'
    | 'vd_shot_live'
    | 'vd_shot_blank'
    | 'vd_reload'
    | 'vd_item_scanner'
    | 'vd_item_generic'
    | 'vd_item_emp'
    | 'vd_win'
    | 'vd_lose';"""

content = content.replace(type_old, type_new)

# Add sound files
files_old = """    popup_close: '/sounds/popup_closed.mp3',
    entercasino: '/sounds/entercasino.mp3',
};"""

files_new = """    popup_close: '/sounds/popup_closed.mp3',
    entercasino: '/sounds/entercasino.mp3',
    vd_shot_live:     '/sounds/vd_shot_live.mp3',
    vd_shot_blank:    '/sounds/vd_shot_blank.mp3',
    vd_reload:        '/sounds/vd_reload.mp3',
    vd_item_scanner:  '/sounds/vd_item_scanner.mp3',
    vd_item_generic:  '/sounds/vd_item_generic.mp3',
    vd_item_emp:      '/sounds/vd_item_emp.mp3',
    vd_win:           '/sounds/vd_win.mp3',
    vd_lose:          '/sounds/vd_lose.mp3',
};"""

content = content.replace(files_old, files_new)

with open('src/lib/client/audioManager.ts', 'w') as f:
    f.write(content)
