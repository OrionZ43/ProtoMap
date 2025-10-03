interface SwipeOptions {
  threshold?: number;
}

export function swipe(node: HTMLElement, options: SwipeOptions = {}) {
  let x: number;
  let startX: number;
  let isSwiping = false;
  const threshold = options.threshold || 50;
  const swipeDirectionLockThreshold = 10;

  function handleMove(event: MouseEvent | TouchEvent) {
    const touch = 'touches' in event ? event.touches[0] : event;
    const dx = touch.clientX - startX;

    if (!isSwiping) {
      if (Math.abs(dx) > swipeDirectionLockThreshold) {
        isSwiping = true;
        if ('preventDefault' in event && event.cancelable) {
          event.preventDefault();
        }
      } else {
        const startY = 'touches' in event ? (event.touches[0] as any).startY : 0;
        const dy = touch.clientY - (startY || touch.clientY);
        if (Math.abs(dy) > swipeDirectionLockThreshold) {
            handleUp();
            return;
        }
      }
    }

    if (isSwiping) {
       if ('preventDefault' in event && event.cancelable) event.preventDefault();
       node.dispatchEvent(new CustomEvent('swipemove', { detail: { dx } }));
    }
  }

  function handleUp(event?: MouseEvent | TouchEvent) {
    if (isSwiping) {
        const finalX = 'changedTouches' in (event || {}) ? (event as TouchEvent).changedTouches[0].clientX : (event as MouseEvent).clientX;
        const finalDx = finalX - startX;

        if (Math.abs(finalDx) > threshold) {
          if (finalDx > 0) node.dispatchEvent(new CustomEvent('swiperight'));
          else node.dispatchEvent(new CustomEvent('swipeleft'));
        }
    }

    node.dispatchEvent(new CustomEvent('swipeend'));

    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('touchend', handleUp);
  }

  function handleDown(event: MouseEvent | TouchEvent) {
    const touch = 'touches' in event ? event.touches[0] : event;
    startX = x = touch.clientX;
    isSwiping = false;

    if ('touches' in event) {
        (touch as any).startY = touch.clientY;
    }

    node.dispatchEvent(new CustomEvent('swipestart'));

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  }

  node.addEventListener('mousedown', handleDown);
  node.addEventListener('touchstart', handleDown, { passive: true });

  return {
    destroy() {
      node.removeEventListener('mousedown', handleDown);
      node.removeEventListener('touchstart', handleDown);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    }
  };
}