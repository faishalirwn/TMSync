import { clientId, clientSecret, traktHeaders } from "./utils/config";

let isLoggedin = false

function checkLoggedIn() {
    chrome.storage.sync.get(["access_token"]).then((result) => {        
        if (result.access_token) {
            isLoggedin = true;
            p.textContent = "logged in"
        }
    });
}
checkLoggedIn();

const button = document.querySelector("button")
const p = document.querySelector("p")

button.addEventListener("click", () => {
    if (isLoggedin) {
        return
    }
    chrome.identity.launchWebAuthFlow({
        url: `https://trakt.tv/oauth/authorize?client_id=${clientId}&redirect_uri=https%3A%2F%2Fhkfpacmhbiccimikfleemmhfemdnjfpf.chromiumapp.org%2F&response_type=code`,
        interactive: true
    }, async (redirectUrl) => {
        const url = new URL(redirectUrl);
        const code = url.searchParams.get("code");

        const response = await fetch("https://api.trakt.tv/oauth/token", {
            method: "POST",
            headers: traktHeaders,
            body: JSON.stringify({
                "code": code,
                "client_id": clientId,
                "client_secret": clientSecret,
                "redirect_uri": redirectUrl,
                "grant_type": "authorization_code"
            })
        })

        const json = await response.json()

        chrome.storage.sync.set({ access_token: json.access_token }).then(() => {
            checkLoggedIn();
        });
    })
})