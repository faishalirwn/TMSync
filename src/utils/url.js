const url = window.location.href;
const urlObj = new URL(url);
const urlPath = urlObj.pathname.split('/');

export const getMediaType = () => {
    let type;

    if (urlPath[1] === 'movie') {
        type = 'movie'
    } else if (urlPath[1] === 'tv') {
        type = 'show'
    }
    return type;
}

export const getEpisode = () => {
    const episodeString = urlPath[-1];
    return {
        season: episodeString.split("-")[0],
        number: episodeString.split("-")[1]
    };
}

export const getUrlIdentifier = () => {
    return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
}