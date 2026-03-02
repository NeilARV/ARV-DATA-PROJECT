export function isNegative(value: number | null | undefined): boolean {

    if (typeof value == 'number') {
        return value < 0;
    }

    return false;
}