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

    it('has Server 2 configured for framextv.tech', () => {
        const framexServer = serverConfig.find(s => s.name === 'Server 2');
        expect(framexServer).toBeDefined();
        expect(framexServer.baseUrl).toBe('https://framextv.tech/embed/');
        expect(framexServer.pattern).toBe('framextv');
    });

    it('has Server 3 configured for cinesrc.st', () => {
        const cinesrcServer = serverConfig.find(s => s.name === 'Server 3');
        expect(cinesrcServer).toBeDefined();
        expect(cinesrcServer.baseUrl).toBe('https://cinesrc.st/embed/');
        expect(cinesrcServer.pattern).toBe('cinesrc');
    });

    it('has Server 4 configured for embed.vidrift.net', () => {
        const vidriftServer = serverConfig.find(s => s.name === 'Server 4');
        expect(vidriftServer).toBeDefined();
        expect(vidriftServer.baseUrl).toBe('https://embed.vidrift.net/embed/');
        expect(vidriftServer.pattern).toBe('default');
    });

    it('has Server 5 configured for vidbolt.xyz', () => {
        const vidboltServer = serverConfig.find(s => s.name === 'Server 5');
        expect(vidboltServer).toBeDefined();
        expect(vidboltServer.baseUrl).toBe('https://vidbolt.xyz/');
        expect(vidboltServer.pattern).toBe('default');
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

    it('has Server 8 configured for embed.cinelite.xyz and flagged as Premium', () => {
        const cineliteServer = serverConfig.find(s => s.name === 'Server 8');
        expect(cineliteServer).toBeDefined();
        expect(cineliteServer.baseUrl).toBe('https://embed.cinelite.xyz/');
        expect(cineliteServer.pattern).toBe('cinelite');
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

    it('has Server 12 configured for player.vidlove.cc and flagged as isAdsFree', () => {
        const vidloveServer = serverConfig.find(s => s.name === 'Server 12');
        expect(vidloveServer).toBeDefined();
        expect(vidloveServer.baseUrl).toBe('https://player.vidlove.cc/embed/');
        expect(vidloveServer.pattern).toBe('default');
        expect(vidloveServer.isAdsFree).toBe(true);
    });

    it('has Server 13 configured for player.cinezo.live and flagged as isAdsFree', () => {
        const cinezoServer = serverConfig.find(s => s.name === 'Server 13');
        expect(cinezoServer).toBeDefined();
        expect(cinezoServer.baseUrl).toBe('https://player.cinezo.live/embed/');
        expect(cinezoServer.pattern).toBe('default');
        expect(cinezoServer.isAdsFree).toBe(true);
    });

    it('has Server 14 configured for vidy.st and flagged as isAdsFree', () => {
        const vidyServer = serverConfig.find(s => s.name === 'Server 14');
        expect(vidyServer).toBeDefined();
        expect(vidyServer.baseUrl).toBe('https://vidy.st/');
        expect(vidyServer.pattern).toBe('default');
        expect(vidyServer.isAdsFree).toBe(true);
    });

    it('has Server 15 configured for vidnest.fun', () => {
        const vidnestServer = serverConfig.find(s => s.name === 'Server 15');
        expect(vidnestServer).toBeDefined();
        expect(vidnestServer.baseUrl).toBe('https://vidnest.fun/');
        expect(vidnestServer.pattern).toBe('default');
    });

    it('has Server 16 configured for embedmaster.link', () => {
        const embedmasterServer = serverConfig.find(s => s.name === 'Server 16');
        expect(embedmasterServer).toBeDefined();
        expect(embedmasterServer.baseUrl).toBe('https://embedmaster.link/');
        expect(embedmasterServer.pattern).toBe('default');
    });

    it('has Server 17 configured for primesrc.me', () => {
        const primesrcServer = serverConfig.find(s => s.name === 'Server 17');
        expect(primesrcServer).toBeDefined();
        expect(primesrcServer.baseUrl).toBe('https://primesrc.me/embed/');
        expect(primesrcServer.pattern).toBe('primesrc');
    });

    describe('buildServerUrl', () => {
        it('builds correct movie and TV URLs for Server 2 (framextv)', () => {
            const framexServer = serverConfig.find(s => s.name === 'Server 2');
            expect(buildServerUrl(framexServer, 'movie', 550, 1, 1)).toBe('https://framextv.tech/embed/550');
            expect(buildServerUrl(framexServer, 'tv', 106379, 2, 4)).toBe('https://framextv.tech/embed/106379/2/4');
        });

        it('builds correct movie and TV URLs for Server 3 (cinesrc)', () => {
            const cinesrcServer = serverConfig.find(s => s.name === 'Server 3');
            expect(buildServerUrl(cinesrcServer, 'movie', 550, 1, 1)).toBe('https://cinesrc.st/embed/movie/550?autoplay=true');
            expect(buildServerUrl(cinesrcServer, 'tv', 106379, 2, 4)).toBe('https://cinesrc.st/embed/tv/106379?s=2&e=4&autoplay=true');
        });

        it('builds correct movie and TV URLs for Server 4 (vidrift)', () => {
            const vidriftServer = serverConfig.find(s => s.name === 'Server 4');
            expect(buildServerUrl(vidriftServer, 'movie', 1007757, 1, 1)).toBe('https://embed.vidrift.net/embed/movie/1007757');
            expect(buildServerUrl(vidriftServer, 'tv', 1399, 1, 1)).toBe('https://embed.vidrift.net/embed/tv/1399/1/1');
        });

        it('builds correct movie and TV URLs for Server 5 (vidbolt)', () => {
            const vidboltServer = serverConfig.find(s => s.name === 'Server 5');
            expect(buildServerUrl(vidboltServer, 'movie', 1007757, 1, 1)).toBe(`https://vidbolt.xyz/movie/1007757${vidboltServer.suffix}`);
            expect(buildServerUrl(vidboltServer, 'tv', 1399, 1, 1)).toBe(`https://vidbolt.xyz/tv/1399/1/1${vidboltServer.suffix}`);
        });

        it('builds correct movie and TV URLs for Server 6 (filmu)', () => {
            const filmuServer = serverConfig.find(s => s.name === 'Server 6');
            expect(buildServerUrl(filmuServer, 'movie', 969681, 1, 1)).toBe('https://embed.filmu.in/embed/movie/969681?autoplay=1');
            expect(buildServerUrl(filmuServer, 'tv', 108978, 1, 1)).toBe('https://embed.filmu.in/embed/tv/108978/1/1?autoplay=1');
        });

        it('builds correct movie and TV URLs for Server 8 (cinelite)', () => {
            const cineliteServer = serverConfig.find(s => s.name === 'Server 8');
            expect(buildServerUrl(cineliteServer, 'movie', 969681, 1, 1)).toBe('https://embed.cinelite.xyz/969681');
            expect(buildServerUrl(cineliteServer, 'tv', 108978, 1, 1)).toBe('https://embed.cinelite.xyz/108978/1/1');
        });

        it('builds correct movie and TV URLs for Server 9 (ythd)', () => {
            const ythdServer = serverConfig.find(s => s.name === 'Server 9');
            expect(buildServerUrl(ythdServer, 'movie', 969681, 1, 1)).toBe('https://ythd.org/embed/969681');
            expect(buildServerUrl(ythdServer, 'tv', 95350, 1, 1)).toBe('https://ythd.org/embed/tv/95350/1/1');
        });

        it('builds correct movie and TV URLs for Server 10 (vaplayer)', () => {
            const vaplayerServer = serverConfig.find(s => s.name === 'Server 10');
            expect(buildServerUrl(vaplayerServer, 'movie', 550, 1, 1)).toBe('https://vaplayer.ru/embed/movie/550?autoplay=1&skin=cinematic&allowfullscreen=true');
            expect(buildServerUrl(vaplayerServer, 'tv', 106379, 2, 4)).toBe('https://vaplayer.ru/embed/tv/106379/2/4?autoplay=1&skin=cinematic&allowfullscreen=true');
        });

        it('builds correct movie and TV URLs for Server 12 (vidlove)', () => {
            const vidloveServer = serverConfig.find(s => s.name === 'Server 12');
            const movieUrl = buildServerUrl(vidloveServer, 'movie', 1212763, 1, 1);
            expect(movieUrl).toBe('https://player.vidlove.cc/embed/movie/1212763?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=ffffff&fontsize=20&opacity=0.5&secondarycolor=ffffff&server=Dark');

            const tvUrl = buildServerUrl(vidloveServer, 'tv', 95350, 1, 1);
            expect(tvUrl).toBe('https://player.vidlove.cc/embed/tv/95350/1/1?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=ffffff&fontsize=20&opacity=0.5&secondarycolor=ffffff&server=Dark');
        });

        it('builds correct movie and TV URLs for Server 13 (cinezo)', () => {
            const cinezoServer = serverConfig.find(s => s.name === 'Server 13');
            const movieUrl = buildServerUrl(cinezoServer, 'movie', 1064213, 1, 1);
            expect(movieUrl).toBe('https://player.cinezo.live/embed/movie/1064213?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff');

            const tvUrl = buildServerUrl(cinezoServer, 'tv', 1399, 1, 1);
            expect(tvUrl).toBe('https://player.cinezo.live/embed/tv/1399/1/1?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff');
        });

        it('builds correct movie and TV URLs for Server 14 (vidy)', () => {
            const vidyServer = serverConfig.find(s => s.name === 'Server 14');
            expect(buildServerUrl(vidyServer, 'movie', 315162, 1, 1)).toBe(`https://vidy.st/movie/315162${vidyServer.suffix}`);
            expect(buildServerUrl(vidyServer, 'tv', 1399, 1, 1)).toBe(`https://vidy.st/tv/1399/1/1${vidyServer.suffix}`);
        });

        it('builds correct movie and TV URLs for Server 16 (embedmaster)', () => {
            const embedmasterServer = serverConfig.find(s => s.name === 'Server 16');
            expect(buildServerUrl(embedmasterServer, 'movie', 550, 1, 1)).toBe('https://embedmaster.link/movie/550');
            expect(buildServerUrl(embedmasterServer, 'tv', 106379, 2, 4)).toBe('https://embedmaster.link/tv/106379/2/4');
        });

        it('builds correct movie and TV URLs for Server 17 (primesrc)', () => {
            const primesrcServer = serverConfig.find(s => s.name === 'Server 17');
            expect(buildServerUrl(primesrcServer, 'movie', 550, 1, 1)).toBe('https://primesrc.me/embed/movie?tmdb=550');
            expect(buildServerUrl(primesrcServer, 'tv', 1399, 1, 1)).toBe('https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1');
        });
    });

    describe('server helpers and ad-free gating', () => {
        it('identifies enabled servers based on disabled status and ad-free entitlement', () => {
            expect(isServerEnabled(0)).toBe(false); // Direct Play is disabled
            expect(isServerEnabled(1)).toBe(true);  // Server 1 is regular and enabled

            // Server 8 (index 8) is a Premium Server
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
