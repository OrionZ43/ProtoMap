// src/lib/admin/credits.ts
//
// Ручная правка баланса из админки («начислить/списать», modifyCredits): баланс
// не уходит в минус. Раньше было FieldValue.increment(amount) без проверки —
// списание больше баланса уводило его в минус уже в БД. Теперь сумма применяется
// в транзакции через этот расчёт: списание упирается в ноль, а в журнал идёт
// фактически применённое изменение (applied), а не запрошенное.

export interface CreditChange {
    /** Новый баланс, не ниже нуля. */
    newBalance: number;
    /** Фактическое изменение баланса (по модулю может быть меньше запрошенного). */
    applied: number;
}

/**
 * Применяет начисление (amount > 0) или списание (amount < 0) к балансу.
 * Нечисловой баланс считается нулём; уже отрицательный (порченый) баланс
 * поднимается до нуля, поэтому applied честно показывает, насколько он сдвинулся.
 */
export function applyCreditDelta(balance: number, amount: number): CreditChange {
    const base = Number.isFinite(balance) ? balance : 0;
    const newBalance = Math.max(0, base + amount);
    return { newBalance, applied: newBalance - base };
}
