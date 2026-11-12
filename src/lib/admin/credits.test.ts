import { describe, it, expect } from 'vitest';
import { applyCreditDelta } from './credits';

describe('applyCreditDelta — правка баланса из админки', () => {
    it('начисление прибавляет', () => {
        expect(applyCreditDelta(500, 1000)).toEqual({ newBalance: 1500, applied: 1000 });
    });

    it('списание в пределах баланса вычитает', () => {
        expect(applyCreditDelta(1500, -1000)).toEqual({ newBalance: 500, applied: -1000 });
    });

    it('списание больше баланса упирается в ноль, applied — фактическое', () => {
        expect(applyCreditDelta(100, -500)).toEqual({ newBalance: 0, applied: -100 });
    });

    it('списание ровно в ноль', () => {
        expect(applyCreditDelta(2128, -2128)).toEqual({ newBalance: 0, applied: -2128 });
    });

    it('нечисловой баланс считается нулём', () => {
        expect(applyCreditDelta(NaN, 300)).toEqual({ newBalance: 300, applied: 300 });
        expect(applyCreditDelta(NaN, -300)).toEqual({ newBalance: 0, applied: 0 });
    });

    it('порченый отрицательный баланс поднимается до нуля даже при списании', () => {
        expect(applyCreditDelta(-500, -100)).toEqual({ newBalance: 0, applied: 500 });
    });

    it('начисление на порченый минус', () => {
        expect(applyCreditDelta(-500, 1000)).toEqual({ newBalance: 500, applied: 1000 });
    });
});
