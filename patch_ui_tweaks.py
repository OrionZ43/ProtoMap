with open('src/routes/casino/roulette/+page.svelte', 'r') as f:
    content = f.read()

# Fix visualScan for item_ps
old_ps_logic = """        if (event.item === 'co') {
            if (event.actor === 'player') visualPhp = Math.min(visualPhp + 1, $rouletteState?.mhp || 0);
            else visualOhp = Math.min(visualOhp + 1, $rouletteState?.mhp || 0);
        } else if (event.item === 'sc') {
            visualScan = $rouletteState?.scan;
        } else if (event.item === 'ad') {
            visualSl = Math.max(0, visualSl - 1);
            visualScan = null;
        }"""
new_ps_logic = """        if (event.item === 'co') {
            if (event.actor === 'player') visualPhp = Math.min(visualPhp + 1, $rouletteState?.mhp || 0);
            else visualOhp = Math.min(visualOhp + 1, $rouletteState?.mhp || 0);
        } else if (event.item === 'sc') {
            visualScan = $rouletteState?.scan;
        } else if (event.item === 'ad') {
            visualSl = Math.max(0, visualSl - 1);
            visualScan = null;
        } else if (event.item === 'ps') {
            visualScan = null;
        }"""
content = content.replace(old_ps_logic, new_ps_logic)

# Remove redundant sound for skip_turn since it plays during item_used
old_skip_turn = """      case 'skip_turn': {
        AudioManager.play('vd_item_emp');
        await sleep(500);
        break;
      }"""
new_skip_turn = """      case 'skip_turn': {
        await sleep(500);
        break;
      }"""
content = content.replace(old_skip_turn, new_skip_turn)

# Add z-index to game-root to cover navbar
old_game_root = """#game-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  font-family: 'Courier New', monospace;
  user-select: none;
} """
new_game_root = """#game-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  font-family: 'Courier New', monospace;
  user-select: none;
  z-index: 9999;
  background-color: black;
} """
content = content.replace(old_game_root, new_game_root)

with open('src/routes/casino/roulette/+page.svelte', 'w') as f:
    f.write(content)
