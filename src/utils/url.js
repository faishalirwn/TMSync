export const getUrlIdentifier = (url) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');
    return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
};

export const getEpisode = (url) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');
    const episodeArr = urlPath[urlPath.length - 1].split('-');
    return {
        season: episodeArr[0],
        number: episodeArr[1]
    };
};
