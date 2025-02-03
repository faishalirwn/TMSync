function getElementByXpath(path: string): Element | null {
    const node = document.evaluate(
        path,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;
    if (node && node.nodeType === Node.ELEMENT_NODE) {
        return node as Element;
    } else {
        return null;
    }
}

export function waitForElm(
    selector: string,
    isXPath: boolean = false,
    duration: number = 1000
): Promise<Element | null> {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (isXPath) {
                const element = getElementByXpath(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            } else {
                if (document.querySelector(selector)) {
                    clearInterval(interval);
                    resolve(document.querySelector(selector));
                }
            }
        }, duration);
    });
}
