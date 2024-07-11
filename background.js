chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log(sender)
        console.log(sender.tab)
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        if (request.greeting === "hello") {

            sendResponse({ farewell: "goodbye wiw" });
        } else {
            
            sendResponse({ farewell: "goodbye normal" });
        }
    }
);