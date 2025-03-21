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
    checkInterval: number = 100,
    maxWaitTime: number = 5000
): Promise<Element> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkForElement = () => {
            if (Date.now() - startTime > maxWaitTime) {
                clearInterval(intervalId);
                reject(
                    new Error(
                        `Element ${selector} not found within ${maxWaitTime}ms`
                    )
                );
                return;
            }

            try {
                let element = null;
                if (isXPath) {
                    element = getElementByXpath(selector);
                } else {
                    element = document.querySelector(selector);
                }

                if (element) {
                    clearInterval(intervalId);
                    resolve(element);
                }
            } catch (error) {
                clearInterval(intervalId);
                reject(error);
            }
        };

        const intervalId = setInterval(checkForElement, checkInterval);

        checkForElement();
    });
}
