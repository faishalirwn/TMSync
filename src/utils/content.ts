export function waitForElm(
    selector: string,
    duration: number = 1000
): Promise<Element | null> {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (document.querySelector(selector)) {
                clearInterval(interval);
                resolve(document.querySelector(selector));
            }
        }, duration);
    });
}
