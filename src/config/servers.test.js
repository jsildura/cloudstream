import { describe, it, expect } from 'vitest';
import { serverConfig, buildServerUrl, isServerEnabled, getFirstEnabledServerIndex, getServerCount } from './servers';

describe('servers configuration', () => {
    it('contains valid server objects in serverConfig', () => {
        expect(serverConfig.length).toBeGreaterThan(0);
        serverConfig.forEach((server) => {
            expect(server.name).toBeDefined();
            expect(server.baseUrl).toBeDefined();
            expect(server.pattern).toBeDefined();
        });
    });

    it('has Server 2 configured for cinesrc.st', () => {
        const cinesrcServer = serverConfig.find(s => s.name === 'Server 2');
        expect(cinesrcServer).toBeDefined();
        expect(cinesrcServer.baseUrl).toBe('https://cinesrc.st/embed/');
        expect(cinesrcServer.pattern).toBe('cinesrc');
    });

    it('has Server 3 configured for embed.vidrift.net', () => {
        const vidriftServer = serverConfig.find(s => s.name === 'Server 3');
        expect(vidriftServer).toBeDefined();
        expect(vidriftServer.baseUrl).toBe('https://embed.vidrift.net/embed/');
        expect(vidriftServer.pattern).toBe('default');
    });

    it('has Server 4 configured for vidbolt.xyz', () => {
        const vidboltServer = serverConfig.find(s => s.name === 'Server 4');
        expect(vidboltServer).toBeDefined();
        expect(vidboltServer.baseUrl).toBe('https://vidbolt.xyz/');
        expect(vidboltServer.pattern).toBe('default');
    });

    it('has Server 5 configured for vidsrc-embed.ru', () => {
        const embedServer = serverConfig.find(s => s.name === 'Server 5');
        expect(embedServer).toBeDefined();
        expect(embedServer.baseUrl).toBe('https://vidsrc-embed.ru/embed/');
        expect(embedServer.pattern).toBe('vidsrc-xyz');
    });

    it('has Server 6 configured for embed.filmu.in', () => {
        const filmuServer = serverConfig.find(s => s.name === 'Server 6');
        expect(filmuServer).toBeDefined();
        expect(filmuServer.baseUrl).toBe('https://embed.filmu.in/embed/');
        expect(filmuServer.pattern).toBe('default');
    });

    it('has Server 7 configured for mapple.uk', () => {
        const mappleServer = serverConfig.find(s => s.name === 'Server 7');
        expect(mappleServer).toBeDefined();
        expect(mappleServer.baseUrl).toBe('https://mapple.uk/watch/');
        expect(mappleServer.pattern).toBe('default');
    });

    it('has Server 8 configured for api.cineby.homes and flagged as isAdsFree', () => {
        const cinebyServer = serverConfig.find(s => s.name === 'Server 8');
        expect(cinebyServer).toBeDefined();
        expect(cinebyServer.baseUrl).toBe('https://api.cineby.homes/embed/');
        expect(cinebyServer.pattern).toBe('default');
        expect(cinebyServer.isAdsFree).toBe(true);
    });

    it('has Server 9 configured for ythd.org and flagged as isAdsFree', () => {
        const ythdServer = serverConfig.find(s => s.name === 'Server 9');
        expect(ythdServer).toBeDefined();
        expect(ythdServer.baseUrl).toBe('https://ythd.org/embed/');
        expect(ythdServer.pattern).toBe('ythd');
        expect(ythdServer.isAdsFree).toBe(true);
    });

    it('has Server 10 configured for vaplayer.ru and flagged as isAdsFree', () => {
        const vaplayerServer = serverConfig.find(s => s.name === 'Server 10');
        expect(vaplayerServer).toBeDefined();
        expect(vaplayerServer.baseUrl).toBe('https://vaplayer.ru/embed/');
        expect(vaplayerServer.pattern).toBe('default');
        expect(vaplayerServer.isAdsFree).toBe(true);
    });

    it('has Server 13 configured for player.vidlove.cc and flagged as isAdsFree', () => {
        const vidloveServer = serverConfig.find(s => s.name === 'Server 13');
        expect(vidloveServer).toBeDefined();
        expect(vidloveServer.baseUrl).toBe('https://player.vidlove.cc/embed/');
        expect(vidloveServer.pattern).toBe('default');
        expect(vidloveServer.isAdsFree).toBe(true);
    });

    it('has Server 14 configured for player.cinezo.live and flagged as isAdsFree', () => {
        const cinezoServer = serverConfig.find(s => s.name === 'Server 14');
        expect(cinezoServer).toBeDefined();
        expect(cinezoServer.baseUrl).toBe('https://player.cinezo.live/embed/');
        expect(cinezoServer.pattern).toBe('default');
        expect(cinezoServer.isAdsFree).toBe(true);
    });

    it('has Server 15 configured for vidy.st and flagged as isAdsFree', () => {
        const vidyServer = serverConfig.find(s => s.name === 'Server 15');
        expect(vidyServer).toBeDefined();
        expect(vidyServer.baseUrl).toBe('https://vidy.st/');
        expect(vidyServer.pattern).toBe('default');
        expect(vidyServer.isAdsFree).toBe(true);
    });

    it('has Server 18 configured for embedmaster.link', () => {
        const embedmasterServer = serverConfig.find(s => s.name === 'Server 18');
        expect(embedmasterServer).toBeDefined();
        expect(embedmasterServer.baseUrl).toBe('https://embedmaster.link/');
        expect(embedmasterServer.pattern).toBe('default');
    });

    it('has Server 19 configured for primesrc.me', () => {
        const primesrcServer = serverConfig.find(s => s.name === 'Server 19');
        expect(primesrcServer).toBeDefined();
        expect(primesrcServer.baseUrl).toBe('https://primesrc.me/embed/');
        expect(primesrcServer.pattern).toBe('primesrc');
    });

    describe('buildServerUrl', () => {
        it('builds correct movie and TV URLs for ythd pattern (Server 9)', () => {
            const ythdServer = serverConfig.find(s => s.name === 'Server 9');

            // Movie URL
            const movieUrl = buildServerUrl(ythdServer, 'movie', 'tt22084616', 1, 1);
            expect(movieUrl).toBe('https://ythd.org/embed/tt22084616/?autoplay=1');

            const tmdbMovieUrl = buildServerUrl(ythdServer, 'movie', 550, 1, 1);
            expect(tmdbMovieUrl).toBe('https://ythd.org/embed/550/?autoplay=1');

            // TV URL
            const tvUrl = buildServerUrl(ythdServer, 'tv', 'tt26545992', 1, 1);
            expect(tvUrl).toBe('https://ythd.org/embed/tt26545992/1-1/?autoplay=1');

            const tmdbTvUrl = buildServerUrl(ythdServer, 'tv', 106379, 2, 4);
            expect(tmdbTvUrl).toBe('https://ythd.org/embed/106379/2-4/?autoplay=1');
        });

        it('builds correct movie and TV URLs for Server 13 (vidlove)', () => {
            const vidloveServer = serverConfig.find(s => s.name === 'Server 13');

            const movieUrl = buildServerUrl(vidloveServer, 'movie', 1212763, 1, 1);
            expect(movieUrl).toBe('https://player.vidlove.cc/embed/movie/1212763?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=ffffff&fontsize=20&opacity=0.5&secondarycolor=ffffff&server=Dark');

            const tvUrl = buildServerUrl(vidloveServer, 'tv', 95350, 1, 1);
            expect(tvUrl).toBe('https://player.vidlove.cc/embed/tv/95350/1/1?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=ffffff&fontsize=20&opacity=0.5&secondarycolor=ffffff&server=Dark');
        });

        it('builds correct movie and TV URLs for Server 14 (cinezo)', () => {
            const cinezoServer = serverConfig.find(s => s.name === 'Server 14');

            const movieUrl = buildServerUrl(cinezoServer, 'movie', 1064213, 1, 1);
            expect(movieUrl).toBe('https://player.cinezo.live/embed/movie/1064213?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff');

            const tvUrl = buildServerUrl(cinezoServer, 'tv', 1399, 1, 1);
            expect(tvUrl).toBe('https://player.cinezo.live/embed/tv/1399/1/1?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff');
        });

        it('builds correct movie and TV URLs for Server 6 (filmu)', () => {
            const filmuServer = serverConfig.find(s => s.name === 'Server 6');

            const movieUrl = buildServerUrl(filmuServer, 'movie', 969681, 1, 1);
            expect(movieUrl).toBe('https://embed.filmu.in/embed/movie/969681?autoplay=1');

            const tvUrl = buildServerUrl(filmuServer, 'tv', 108978, 1, 1);
            expect(tvUrl).toBe('https://embed.filmu.in/embed/tv/108978/1/1?autoplay=1');
        });

        it('builds correct movie and TV URLs for Server 2 (cinesrc)', () => {
            const cinesrcServer = serverConfig.find(s => s.name === 'Server 2');

            const movieUrl = buildServerUrl(cinesrcServer, 'movie', 550, 1, 1);
            expect(movieUrl).toBe('https://cinesrc.st/embed/movie/550?autoplay=true&autonext=true');

            const tvUrl = buildServerUrl(cinesrcServer, 'tv', 106379, 2, 4);
            expect(tvUrl).toBe('https://cinesrc.st/embed/tv/106379?s=2&e=4&autoplay=true&autonext=true');
        });

        it('builds correct movie and TV URLs for Server 10 (vaplayer)', () => {
            const vaplayerServer = serverConfig.find(s => s.name === 'Server 10');

            const movieUrl = buildServerUrl(vaplayerServer, 'movie', 550, 1, 1);
            expect(movieUrl).toBe('https://vaplayer.ru/embed/movie/550?autoplay=1&skin=cinematic&allowfullscreen=true');

            const tvUrl = buildServerUrl(vaplayerServer, 'tv', 106379, 2, 4);
            expect(tvUrl).toBe('https://vaplayer.ru/embed/tv/106379/2/4?autoplay=1&skin=cinematic&allowfullscreen=true');
        });

        it('builds correct URLs for default pattern (Server 8 - cineby)', () => {
            const defaultServer = serverConfig.find(s => s.name === 'Server 8');
            expect(buildServerUrl(defaultServer, 'movie', 550, 1, 1)).toBe('https://api.cineby.homes/embed/movie/550?autoplay=1');
            expect(buildServerUrl(defaultServer, 'tv', 106379, 1, 2)).toBe('https://api.cineby.homes/embed/tv/106379/1/2?autoplay=1');
        });

        it('builds correct movie and TV URLs for Server 4 (vidbolt)', () => {
            const vidboltServer = serverConfig.find(s => s.name === 'Server 4');
            expect(buildServerUrl(vidboltServer, 'movie', 1007757, 1, 1)).toBe(`https://vidbolt.xyz/movie/1007757${vidboltServer.suffix}`);
            expect(buildServerUrl(vidboltServer, 'tv', 1399, 1, 1)).toBe(`https://vidbolt.xyz/tv/1399/1/1${vidboltServer.suffix}`);
        });

        it('builds correct movie and TV URLs for Server 5 (vidsrc-embed)', () => {
            const embedServer = serverConfig.find(s => s.name === 'Server 5');
            expect(buildServerUrl(embedServer, 'movie', 550, 1, 1)).toBe('https://vidsrc-embed.ru/embed/movie/550');
            expect(buildServerUrl(embedServer, 'tv', 1399, 1, 1)).toBe('https://vidsrc-embed.ru/embed/tv?tmdb=1399&season=1&episode=1');
        });

        it('builds correct movie and TV URLs for Server 15 (vidy)', () => {
            const vidyServer = serverConfig.find(s => s.name === 'Server 15');
            expect(buildServerUrl(vidyServer, 'movie', 315162, 1, 1)).toBe(`https://vidy.st/movie/315162${vidyServer.suffix}`);
            expect(buildServerUrl(vidyServer, 'tv', 1399, 1, 1)).toBe(`https://vidy.st/tv/1399/1/1${vidyServer.suffix}`);
        });

        it('builds correct movie and TV URLs for Server 3 (vidrift)', () => {
            const vidriftServer = serverConfig.find(s => s.name === 'Server 3');
            expect(buildServerUrl(vidriftServer, 'movie', 1007757, 1, 1)).toBe('https://embed.vidrift.net/embed/movie/1007757');
            expect(buildServerUrl(vidriftServer, 'tv', 1399, 1, 1)).toBe('https://embed.vidrift.net/embed/tv/1399/1/1');
        });

        it('builds correct movie and TV URLs for Server 18 (embedmaster)', () => {
            const embedmasterServer = serverConfig.find(s => s.name === 'Server 18');
            expect(buildServerUrl(embedmasterServer, 'movie', 550, 1, 1)).toBe('https://embedmaster.link/movie/550');
            expect(buildServerUrl(embedmasterServer, 'tv', 106379, 2, 4)).toBe('https://embedmaster.link/tv/106379/2/4');
        });

        it('builds correct movie and TV URLs for Server 19 (primesrc)', () => {
            const primesrcServer = serverConfig.find(s => s.name === 'Server 19');
            expect(buildServerUrl(primesrcServer, 'movie', 550, 1, 1)).toBe('https://primesrc.me/embed/movie?tmdb=550');
            expect(buildServerUrl(primesrcServer, 'tv', 1399, 1, 1)).toBe('https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1');
        });
    });

    describe('server helpers and ad-free gating', () => {
        it('identifies enabled servers based on disabled status and ad-free entitlement', () => {
            expect(isServerEnabled(0)).toBe(false); // Direct Play is disabled
            expect(isServerEnabled(1)).toBe(true);  // Server 1 is regular and enabled

            // Server 8 (index 8) has isAdsFree: true (Premium Server)
            expect(isServerEnabled(8, false)).toBe(false); // blocked for non-ad-free
            expect(isServerEnabled(8)).toBe(false);        // defaults to non-ad-free
            expect(isServerEnabled(8, true)).toBe(true);   // allowed for ad-free user
        });

        it('gets first enabled server index for non-ad-free and ad-free users', () => {
            expect(getFirstEnabledServerIndex(false)).toBe(1);
            expect(getFirstEnabledServerIndex(true)).toBe(1);
        });

        it('returns correct server count', () => {
            expect(getServerCount()).toBe(serverConfig.length);
        });
    });
});
