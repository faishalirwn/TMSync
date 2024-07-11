const url = window.location.href;
console.log(url);
const urlObj = new URL(url);
if (urlObj.hostname === "fmovies24.to" && (urlObj.pathname.startsWith('/tv') || urlObj.pathname.startsWith('/movie'))) {
    const title = document.querySelector("h1.name").textContent;
    const year = document.querySelector("span.year").textContent;

    const metaDiv = document.querySelector("div.meta")
    const runtime = metaDiv.children[metaDiv.children.length - 1].textContent.split(" ")[0]

    const genreSpan = document.querySelector('div.detail > div:nth-child(3) > span').textContent
    const genres = genreSpan.split(",").map((genre) => genre.trim().toLowerCase())

    console.log(title)
    console.log(year)
    console.log(genres)
    console.log(runtime);

    (async () => {
        const response = await chrome.runtime.sendMessage({ greeting: "hellos" });
        // do something with response here, not outside the function
        console.log(response);
    })();

    // const playerDiv = document.querySelector('#player')

    // const callback = mutations => {
    //     const intervalId = window.setInterval(function () {
    //         console.log(mutations)
    //         const playerIframe = playerDiv.querySelector('iframe')
    //         const iframeDoc = playerIframe.contentDocument || playerIframe.contentWindow.document
    //         console.log(iframeDoc)

    //     }, 3000);
    // }

    // const observer = new MutationObserver(callback)
    // observer.observe(playerDiv, {
    //     childList: true
    // })

}