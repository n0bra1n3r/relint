export function sortedIndex<T>(sortedArray: T[], item: T, comparator: (a: T, b: T) => boolean) {
    let lo = 0;
    let hi = sortedArray.length;

    while (lo < hi) {
        let mid = (lo + hi) >>> 1;
        if (comparator(sortedArray[mid], item)) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}
