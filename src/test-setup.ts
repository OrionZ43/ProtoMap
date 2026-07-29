// Заглушки браузерных API, которых нет в jsdom.
// Это пробелы окружения, а не поведение приложения: без них любой компонент
// с transition: падает на element.animate, а ленивый рендер голосовых —
// на IntersectionObserver.

if (typeof Element !== 'undefined' && !Element.prototype.animate) {
	Element.prototype.animate = () =>
		({
			finished: Promise.resolve(),
			cancel() {},
			pause() {},
			play() {},
			reverse() {},
			finish() {},
			addEventListener() {},
			removeEventListener() {},
			currentTime: 0,
			startTime: 0,
			playState: 'finished',
			effect: { getComputedTiming: () => ({ duration: 0 }) }
		}) as unknown as Animation;
}

if (typeof globalThis !== 'undefined' && !('IntersectionObserver' in globalThis)) {
	class IntersectionObserverStub {
		root = null;
		rootMargin = '';
		thresholds: number[] = [];
		observe() {}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	}
	(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
		IntersectionObserverStub;
}
