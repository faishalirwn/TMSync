let isLoggedin = false

function checkLoggedIn() {
    chrome.storage.sync.get(["access_token"]).then((result) => {
        console.log("token", result.access_token)
        if (result.access_token) {
            isLoggedin = true;
            p.textContent = "logged in"
        }
    });
}
checkLoggedIn();

const button = document.querySelector("button")
const p = document.querySelector("p")

const clientId = "50737513fa9d951db397f60cdc6754065bf95fc95b03ed41fac0ede3c449c51c"
const clientSecret = "1c46b40da2bcf615e7fae02de584edc8ac6e88258412743714ac0d6516576dec"

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
            headers: {
                "Content-Type": "application/json",
                "trakt-api-key": clientId,
                "trakt-api-version": "2",
            },
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
            console.log("Value is set");
            checkLoggedIn();
        });
    })
})