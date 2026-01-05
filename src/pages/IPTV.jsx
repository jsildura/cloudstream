import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './IPTV.css';

const M3U_URL = 'https://viplaylist.vercel.app/cignal.m3u';
const OFFLINE_CHANNELS_KEY = 'iptv_offline_channels';
const FAVORITES_KEY = 'iptv_favorites';

/**
 * Parse M3U playlist into channel objects
 * Handles two formats:
 * 1. Standard: #EXTINF + #KODIPROP + URL
 * 2. Simple: #KODIPROP + URL (no EXTINF - generate name from URL)
 * Extracts ClearKey DRM info from #KODIPROP lines
 */
const parseM3U = (content) => {
  const lines = content.split('\n');
  const channels = [];
  let pendingLicenseKey = null;
  let pendingLicenseType = null;
  let pendingExtinf = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse KODIPROP for DRM info
    if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
      pendingLicenseType = line.split('=')[1];
    } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
      pendingLicenseKey = line.split('=')[1];
    } else if (line.startsWith('#EXTINF:')) {
      // Check for TVPass group - skip these
      if (line.includes('group-title="TVPass"')) {
        pendingExtinf = { skip: true };
      } else {
        // Store EXTINF info for the next URL line
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const nameMatch = line.match(/,(.+)$/);
        pendingExtinf = {
          name: nameMatch ? nameMatch[1].trim() : null,
          logo: logoMatch ? logoMatch[1] : null,
          category: groupMatch ? groupMatch[1] : 'Entertainment',
          skip: false
        };
      }
    } else if (line && !line.startsWith('#')) {
      // Skip if explicitly marked to skip (TVPass)
      if (pendingExtinf?.skip) {
        pendingLicenseKey = null;
        pendingLicenseType = null;
        pendingExtinf = null;
        continue;
      }

      // This is a stream URL - create channel
      let channelName = pendingExtinf?.name;
      let channelLogo = pendingExtinf?.logo;
      let mappleId = null;

      // Try to extract Mapple ID from URL (e.g., .../premium303/...)
      // This is slightly speculative, but based on the URL structure:
      // https://nfsnew.kiko2.ru/nfs/premium303/mono.css -> 303
      // https://nfsnew.kiko2.ru/nfs/premium123/mono.css -> 123
      const mappleMatch = line.match(/premium(\d+)/);
      if (mappleMatch) {
        mappleId = mappleMatch[1];
      }

      // If no EXTINF, try to generate name from URL
      if (!channelName) {
        // Extract channel name from URL path (e.g., /bpk-tv/cg_animal_planet_sd/ → Animal Planet SD)
        const urlMatch = line.match(/\/bpk-tv\/([^/]+)\//);
        if (urlMatch) {
          channelName = urlMatch[1]
            .replace(/^cg_/, '') // Remove cg_ prefix
            .replace(/_/g, ' ')  // Replace underscores with spaces
            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize words
        } else {
          channelName = `Channel ${channels.length + 1}`;
        }
      }

      channels.push({
        id: channels.length,
        name: channelName,
        logo: channelLogo,
        category: pendingExtinf?.category || 'Entertainment',
        url: line,
        licenseType: pendingLicenseKey ? 'clearkey' : null, // Assume clearkey if key present
        licenseKey: pendingLicenseKey,
        mappleId: mappleId
      });

      // Reset pending values after using them
      pendingLicenseKey = null;
      pendingLicenseType = null;
      pendingExtinf = null;
    }
  }

  return channels;
};


/**
 * Load offline channels from localStorage
 */
const loadOfflineChannels = () => {
  try {
    const saved = localStorage.getItem(OFFLINE_CHANNELS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * Save offline channels to localStorage
 */
const saveOfflineChannels = (ids) => {
  try {
    localStorage.setItem(OFFLINE_CHANNELS_KEY, JSON.stringify(ids));
  } catch (e) {
    console.error('Error saving offline channels:', e);
  }
};

/**
 * Load favorites from localStorage
 */
const loadFavorites = () => {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * Save favorites to localStorage
 */
const saveFavorites = (ids) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
};

const IPTV = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [offlineChannels, setOfflineChannels] = useState(() => loadOfflineChannels());
  const [favorites, setFavorites] = useState(() => loadFavorites());

  // Check if returning from a failed channel
  useEffect(() => {
    if (location.state?.markOffline !== undefined) {
      const channelId = location.state.markOffline;
      if (!offlineChannels.includes(channelId)) {
        const updated = [...offlineChannels, channelId];
        setOfflineChannels(updated);
        saveOfflineChannels(updated);
      }
      // Clear the state
      navigate('/iptv', { replace: true, state: {} });
    }
  }, [location.state, offlineChannels, navigate]);

  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        setLoading(true);
        const response = await fetch(M3U_URL);
        if (!response.ok) throw new Error('Failed to fetch playlist');
        const text = await response.text();
        const parsed = parseM3U(text);

        // Add manual/test channels (Mapple)
        const manualChannels = [
          {
            id: 'mapple-amc',
            name: 'AMC USA',
            logo: '/channels/amc_logo.png',
            url: 'https://nfsnew.kiko2.ru/nfs/premium303/mono.css',
            mappleId: '303',
            licenseType: 'clearkey' // Dynamic via harvester
          },

          {
            id: 'mapple-ahc',
            name: 'AHC (American Heroes Channel)',
            logo: '/channels/American_Heroes_Channel_logo.png',
            category: 'Documentary',
            url: 'https://ddy6new.kiko2.ru/ddy6/premium206/mono.css',
            mappleId: '206',
            licenseType: 'clearkey'
          },
          // === SHAKZZ.ONLINE CHANNELS (ClearKey - works on mobile!) ===
          // Movies
          {
            id: 'shakzz-hbo',
            name: 'HBO',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg',
            category: 'Movies',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_hbohd/default/index.mpd',
            licenseKey: 'd47ebabf7a21430b83a8c4b82d9ef6b1:54c213b2b5f885f1e0290ee4131d425b'
          },
          {
            id: 'shakzz-hbo-hits',
            name: 'HBO Hits',
            logo: 'https://cms.cignal.tv/Upload/Images/HBO Hits-1.jpg',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_hbohits/default1/index.mpd',
            licenseKey: 'b04ae8017b5b4601a5a0c9060f6d5b7d:a8795f3bdb8a4778b7e888ee484cc7a1'
          },
          {
            id: 'shakzz-cinemax',
            name: 'Cinemax',
            logo: 'https://logodix.com/logo/2138572.png',
            category: 'Movies',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_cinemax/default/index.mpd',
            licenseKey: 'b207c44332844523a3a3b0469e5652d7:fe71aea346db08f8c6fbf0592209f955'
          },
          {
            id: 'shakzz-cinema-one',
            name: 'Cinema One',
            logo: 'https://download.logo.wine/logo/Cinema_One/Cinema_One-Logo.wine.png',
            category: 'Movies',
            url: 'https://d9rpesrrg1bdi.cloudfront.net/out/v1/93b9db7b231d45f28f64f29b86dc6c65/index.mpd',
            licenseKey: '58d0e56991194043b8fb82feb4db7276:d68f41b59649676788889e19fb10d22c'
          },
          {
            id: 'shakzz-hits-movies',
            name: 'HITS Movies',
            logo: 'https://i.imgur.com/xjyDTMr.png',
            category: 'Movies',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_hitsmovies/default/index.mpd',
            licenseKey: 'f56b57b32d7e4b2cb21748c0b56761a7:3df06a89aa01b32655a77d93e09e266f'
          },
          // News
          {
            id: 'shakzz-cnn',
            name: 'CNN International',
            logo: 'https://laguia.tv/_nuxt/img/CNN_512.0e91aae.png',
            category: 'News',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_cnnhd/default/index.mpd',
            licenseKey: '900c43f0e02742dd854148b7a75abbec:da315cca7f2902b4de23199718ed7e90'
          },
          {
            id: 'shakzz-france24',
            name: 'France 24',
            logo: 'https://i.imgur.com/d8doNpe.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/france24/default/index.mpd',
            licenseKey: '257f9fdeb39d41bdb226c2ae1fbdaeb6:e80ead0f4f9d6038ab34f332713ceaa5'
          },
          // Kids & Animation

          {
            id: 'shakzz-nickelodeon',
            name: 'Nickelodeon',
            logo: 'https://i.imgur.com/4o5dNZA.png',
            category: 'Kids',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_nickelodeon/default/index.mpd',
            licenseKey: '9ce58f37576b416381b6514a809bfd8b:f0fbb758cdeeaddfa3eae538856b4d72'
          },
          {
            id: 'shakzz-nick-jr',
            name: 'Nick Jr',
            logo: 'https://i.imgur.com/iIVYdZP.png',
            category: 'Kids',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_nickjr/default/index.mpd',
            licenseKey: 'bab5c11178b646749fbae87962bf5113:0ac679aad3b9d619ac39ad634ec76bc8'
          },
          {
            id: 'shakzz-animax',
            name: 'Animax',
            logo: 'https://iconape.com/wp-content/files/px/285466/svg/animax-logo-logo-icon-png-svg.png',
            category: 'Kids',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_animax_sd_new/default/index.mpd',
            licenseKey: '92032b0e41a543fb9830751273b8debd:03f8b65e2af785b10d6634735dbe6c11'
          },
          // Documentary
          {
            id: 'shakzz-discovery',
            name: 'Discovery Channel',
            logo: 'https://i.imgur.com/XsvAk5H.png',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/discovery/default/index.mpd',
            licenseKey: 'd9ac48f5131641a789328257e778ad3a:b6e67c37239901980c6e37e0607ceee6'
          },
          {
            id: 'shakzz-bbc-earth',
            name: 'BBC Earth',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/BBC_Earth.svg',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_bbcearth_hd1/default/index.mpd',
            licenseKey: '34ce95b60c424e169619816c5181aded:0e2a2117d705613542618f58bf26fc8e'
          },
          {
            id: 'shakzz-history',
            name: 'History Channel',
            logo: 'https://logos-world.net/wp-content/uploads/2023/07/History-Logo.jpg',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_historyhd/default/index.mpd',
            licenseKey: 'a7724b7ca2604c33bb2e963a0319968a:6f97e3e2eb2bade626e0281ec01d3675'
          },
          // Sports
          /* PEACOCK STREAMS (Require Header/Proxy - Currently 403)
          {
            id: 'shakzz-wwe',
            name: 'WWE',
            logo: 'https://mcdn.wallpapersafari.com/medium/43/73/OC5BrI.png',
            url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc106wh3yw)/master.mpd',
            licenseKey: '00208c93f4358213b52220898b962385:8ae6063167228e350dd132d4a1573102'
          },
          {
            id: 'shakzz-premier-league',
            name: 'Premier League',
            logo: 'https://logos-world.net/wp-content/uploads/2023/02/Premier-League-Logo-2007.png',
            url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc1021n07j)/master.mpd',
            licenseKey: '002046c9a49b9ab1cdb6616bec5d26c3:d2f92f6b7edc9a1a05d393ba0c20ef9e'
          },
          */
          {
            id: 'shakzz-one-sports',
            name: 'One Sports HD',
            logo: 'https://i.imgur.com/CzHITOm.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_onesports_hd/default/index.mpd',
            licenseKey: '53c3bf2eba574f639aa21f2d4409ff11:3de28411cf08a64ea935b9578f6d0edd'
          },
          {
            id: 'shakzz-premier-sports',
            name: 'Premier Sports',
            logo: 'https://i.imgur.com/FwqZXUg.jpeg',
            category: 'Sports',
            url: 'https://amg19223-amg19223c3-amgplt0351.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg19223-amg19223c3-amgplt0351/playlist.m3u8'
          },
          {
            id: 'shakzz-premier-sports-2',
            name: 'Premier Sports 2',
            logo: 'https://i.imgur.com/lW15PhX.jpeg',
            category: 'Sports',
            url: 'https://amg19223-amg19223c4-amgplt0351.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg19223-amg19223c4-amgplt0351/playlist.m3u8'
          },
          // Entertainment
          {
            id: 'shakzz-axn',
            name: 'AXN',
            logo: 'https://icon2.cleanpng.com/20180702/pfc/kisspng-axn-television-channel-sony-channel-television-sho-axn-5b3a0ac39f5e85.1062681315305304996528.jpg',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_axn_sd/default/index.mpd',
            licenseKey: 'fd5d928f5d974ca4983f6e9295dfe410:3aaa001ddc142fedbb9d5557be43792f'
          },

          {
            id: 'shakzz-hgtv',
            name: 'HGTV',
            logo: 'https://i.imgur.com/a6gRxAV.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/hgtv_hd1/default/index.mpd',
            licenseKey: 'f0e3ab943318471abc8b47027f384f5a:13802a79b19cc3485d2257165a7ef62a'
          },
          {
            id: 'shakzz-kbs-world',
            name: 'KBS World',
            logo: 'https://i.imgur.com/aFDRmtm.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/kbsworld/default/index.mpd',
            licenseKey: '22ff2347107e4871aa423bea9c2bd363:c6e7ba2f48b3a3b8269e8bc360e60404'
          },
          // HLS Channels (No DRM)
          {
            id: 'bbc-impossible',
            name: 'BBC Impossible',
            logo: 'https://i.imgur.com/IlIPwWV.png',
            category: 'Entertainment',
            url: 'https://bbc-impossible-1-us.xumo.wurl.tv/4300.m3u8'
          },
          {
            id: 'shakzz-amc-thrillers',
            name: 'AMC Thrillers',
            logo: 'https://provider-static.plex.tv/6/epg/channels/logos/gracenote/6e7af423114c9f735d17e142783f233a.png',
            category: 'Movies',
            url: 'https://436f59579436473e8168284cac5d725f.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/Plex_RushByAMC/playlist.m3u8'
          },
          {
            id: 'shakzz-anime-hidive',
            name: 'Anime X Hidive',
            logo: 'https://www.tablotv.com/wp-content/uploads/2023/12/AnimeXHIDIVE_official-768x499.png',
            category: 'Kids',
            url: 'https://amc-anime-x-hidive-1-us.tablo.wurl.tv/playlist.m3u8'
          },
          {
            id: 'shakzz-animex',
            name: 'AnimeX',
            logo: 'https://logomakerr.ai/uploads/output/2023/08/01/8d87f4803925f46fcdb6b9ae8a1e6244.jpg',
            category: 'Kids',
            url: 'https://live20.bozztv.com/giatv/giatv-animex/animex/chunks.m3u8'
          },
          {
            id: 'shakzz-angry-birds',
            name: 'Angry Birds',
            logo: 'https://www.pikpng.com/pngl/m/83-834869_angry-birds-theme-angry-birds-game-logo-png.png',
            category: 'Kids',
            url: 'https://stream-us-east-1.getpublica.com/playlist.m3u8?network_id=547'
          },
          {
            id: 'shakzz-kidoodle',
            name: 'Kidoodle TV',
            logo: 'https://d1iiooxwdowqwr.cloudfront.net/pub/appsubmissions/20201230211817_FullLogoColor4x.png',
            category: 'Kids',
            url: 'https://amg07653-apmc-amg07653c5-samsung-ph-8539.playouts.now.amagi.tv/playlist.m3u8'
          },
          {
            id: 'shakzz-kapamilya',
            name: 'Kapamilya Channel HD',
            logo: 'https://cms.cignal.tv/Upload/Images/Kapamilya Channel Logo alpha.png',
            category: 'Pinoy',
            url: 'https://d1uf7s78uqso1e.cloudfront.net/out/v1/efa01372657648be830e7c23ff68bea2/index.mpd',
            licenseKey: 'bd17afb5dc9648a39be79ee3634dd4b8:3ecf305d54a7729299b93a3d69c02ea5'
          },
          // Added: ABC, AMC+, ANC + Others
          {
            id: 'shakzz-abc-australia',
            name: 'ABC Australia',
            logo: 'https://i.pinimg.com/736x/5a/66/65/5a666508bc5851a6a9c1151e7eefff3d.jpg',
            category: 'News',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/abc_aus/default/index.mpd',
            licenseKey: '389497f9f8584a57b234e27e430e04b7:3b85594c7f88604adf004e45c03511c0'
          },
          {
            id: 'shakzz-amc-plus',
            name: 'AMC+',
            logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png?v=1650990755',
            url: 'https://bcovlive-a.akamaihd.net/ba853de442c140b7b3dc020001597c0a/us-east-1/6245817279001/profile_0/chunklist.m3u8'
          },
          {
            id: 'shakzz-anc',
            name: 'ANC',
            logo: 'https://data-corporate.abs-cbn.com/corp/medialibrary/dotcom/corp news sports 2020/anc station id/anc goes global_2.jpg',
            category: 'News',
            url: 'https://d3cjss68xc4sia.cloudfront.net/out/v1/89ea8db23cb24a91bfa5d0795f8d759e/index.mpd',
            licenseKey: '4bbdc78024a54662854b412d01fafa16:6039ec9b213aca913821677a28bd78ae'
          },
          // === NEW ADDITIONS (Pinoy, Sports, Entertainment) ===
          {
            id: 'shakzz-gma7',
            name: 'GMA 7',
            logo: 'https://ottepg8.comclark.com:8443/iptvepg/images/markurl/mark_1723126306082.png',
            category: 'Pinoy',
            url: 'https://gsattv.akamaized.net/live/media0/gma7/Fairplay/gma7.m3u8',
            licenseKey: 'https://key.nathcreqtives.com/widevine/?deviceId=02:00:00:00:00:00', // Ensure this works or fallback
          },
          // GTV source missing manifest
          /*
        {
          id: 'shakzz-gtv',
          name: 'GTV',
          logo: 'https://ottepg8.comclark.com:8443/iptvepg/images/markurl/mark_1723126332757.png',
          url: 'https://d3cjss68xc4sia.cloudfront.net/out/v1/d3cjss68xc4sia/gtv.m3u8' 
        },
          */
          {
            id: 'red-bull',
            name: 'Red Bull TV',
            logo: 'https://i.imgur.com/Ju6FJNA.png',
            category: 'Sports',
            url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8'
          },
          {
            id: 'shakzz-pba-rush',
            name: 'PBA Rush',
            logo: 'https://static.wikia.nocookie.net/russel/images/0/00/PBA_Rush_Logo_2016.png/revision/latest/scale-to-width-down/250?cb=20250217140355',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_pbarush_hd1/default/index.mpd',
            licenseKey: '76dc29dd87a244aeab9e8b7c5da1e5f3:95b2f2ffd4e14073620506213b62ac82'
          },
          {
            id: 'shakzz-uaap',
            name: 'UAAP Varsity Channel',
            logo: 'https://i.imgur.com/V0sxXci.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_uaap_cplay_sd/default/index.mpd',
            licenseKey: '95588338ee37423e99358a6d431324b9:6e0f50a12f36599a55073868f814e81e'
          },
          {
            id: 'shakzz-jeepney-tv',
            name: 'Jeepney TV',
            logo: 'https://upload.wikimedia.org/wikipedia/en/1/15/Jeepney_TV_Logo_2015.svg',
            category: 'Pinoy',
            url: 'https://abslive.akamaized.net/dash/live/2028025/jeepneytv/manifest.mpd',
            licenseKey: '90ea4079e02f418db7b170e8763e65f0:1bfe2d166e31d03eee86ee568bd6c272'
          },
          {
            id: 'shakzz-pbo',
            name: 'PBO',
            logo: 'https://i.imgur.com/550RYpJ.png',
            category: 'Pinoy',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/pbo_sd/default/index.mpd',
            licenseKey: 'dcbdaaa6662d4188bdf97f9f0ca5e830:31e752b441bd2972f2b98a4b1bc1c7a1'
          },
          /* REMOVED CINEMO
          {
            id: 'shakzz-cinemo',
            name: 'Cinemo',
            logo: 'https://th.bing.com/th/id/OIP.YQlhh4Welb3cggK1H7oE3QHaEF?rs=1&pid=ImgDetMain',
            category: 'Pinoy',
            url: 'https://d1bail49udbz1k.cloudfront.net/out/v1/3a895f368f4a467c9bca0962559efc19/index.mpd',
            licenseKey: 'aa8aebe35ccc4541b7ce6292efcb1bfb:daab1df109d22fc5d7e3ec121ddf24e5f'
          },
          */
          /* Premier Sports 2 Moved to Sports Category */
          {
            id: 'shakzz-hits-now',
            name: 'HITS Now',
            logo: 'https://i.imgur.com/Ck0ad9b.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_hitsnow/default/index.mpd',
            licenseKey: '14439a1b7afc4527bb0ebc51cf11cbc1:92b0287c7042f271b266cc11ab7541f1'
          },
          {
            id: 'shakzz-rock-ent',
            name: 'Rock Entertainment',
            logo: 'https://i.imgur.com/fx1Y2Eh.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockentertainment/default/index.mpd',
            licenseKey: 'e4ee0cf8ca9746f99af402ca6eed8dc7:be2a096403346bc1d0bb0f812822bb62'
          },
          {
            id: 'shakzz-crime-inv',
            name: 'Crime & Investigation',
            logo: 'https://i.imgur.com/9QBOVGF.png',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/crime_invest/default/index.mpd',
            licenseKey: '21e2843b561c4248b8ea487986a16d33:db6bb638ccdfc1ad1a3e98d728486801'
          },
          {
            id: 'shakzz-global-trekker',
            name: 'Global Trekker',
            logo: 'https://accion.com.ph/wp-content/uploads/2023/02/GT-Thumbnail-New.jpg',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_tapedge/default/index.mpd',
            licenseKey: '4553f7e8011f411fb625cefc39274300:98f2f1d153367e84b5d559dc9dfb9a35'
          },
          {
            id: 'shakzz-lotus-macau',
            name: 'Lotus Macau',
            logo: 'https://i.imgur.com/5G72qjx.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/lotusmacau_prd/default/index.mpd',
            licenseKey: '60dc692e64ea443a8fb5ac186c865a9b:01bdbe22d59b2a4504b53adc2f606cc1'
          },
          {
            id: 'shakzz-aniplus',
            name: 'Aniplus',
            logo: 'https://i.imgur.com/TXTluER.png',
            category: 'Kids',
            url: 'https://amg18481-amg18481c1-amgplt0352.playout.now3.amagi.tv/playlist/amg18481-amg18481c1-amgplt0352/playlist.m3u8'
          },
          {
            id: 'shakzz-zoomoo',
            name: 'Zoo Moo Asia',
            logo: 'https://ia803207.us.archive.org/32/items/zoo-moo-kids-2020_202006/ZooMoo-Kids-2020.png',
            category: 'Kids',
            url: 'https://zoomoo-samsungau.amagi.tv/playlist.m3u8'
          },
          {
            id: 'shakzz-celestial-pinoy',
            name: 'Celestial Movies Pinoy',
            logo: 'https://i.imgur.com/e5IZsv3.png',
            category: 'Pinoy',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/celmovie_pinoy_sd/default/index.mpd',
            licenseKey: '0f8537d8412b11edb8780242ac120002:2ffd7230416150fd5196fd7ea71c36f3'
          },
          // More High Quality Channels
          {
            id: 'shakzz-premier-league',
            name: 'Premier League',
            logo: 'https://logos-world.net/wp-content/uploads/2023/02/Premier-League-Logo-2007.png',
            url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc1021n07j)/master.mpd',
            licenseKey: '002046c9a49b9ab1cdb6616bec5d26c3:d2f92f6b7edc9a1a05d393ba0c20ef9e'
          },
          {
            id: 'shakzz-bbc-news',
            name: 'BBC News',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BBC_News_2022_(Alt).svg/1200px-BBC_News_2022_(Alt).svg.png',
            url: 'https://atemeshield1-voe.sysln.id/live/eds/BBCWorldNewsHD/mpd/BBCWorldNewsHD.mpd',
            licenseKey: '975ef0f16ca94eee8aa5c3a6ff9149e7:2b69f4bdc9e4aa4f6ec03220b0c89dd1'
          },
          {
            id: 'shakzz-bloomberg',
            name: 'Bloomberg',
            logo: 'https://thumbs.dreamstime.com/b/bloomberg-logo-editorial-illustrative-white-background-logo-icon-vector-logos-icons-set-social-media-flat-banner-vectors-svg-210442338.jpg',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/bloomberg_sd/default/index.mpd',
            licenseKey: 'ef7d9dcfb99b406cb79fb9f675cba426:b24094f6ca136af25600e44df5987af4'
          },
          {
            id: 'shakzz-dreamworks',
            name: 'DreamWorks HD',
            logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDPoIb5G0splDYh5wCQY_vWyooZSSjfalhaQ&s',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_dreamworks_hd1/default/index.mpd',
            licenseKey: '4ab9645a2a0a47edbd65e8479c2b9669:8cb209f1828431ce9b50b593d1f44079'
          },
          // === NEW iWatchTV CHANNELS ===
          {
            id: 'iwatch-new-korean-movies',
            name: 'New Korean Movies',
            logo: 'https://i.imgur.com/NuGi9x1.jpeg',
            category: 'Movies',
            url: 'https://dbrb49pjoymg4.cloudfront.net/manifest/3fec3e5cac39a52b2132f9c66c83dae043dc17d4/prod_default_xumo-ams-aws/0e99c6ec-a912-4cfd-ad60-59c3223ae77d/5.m3u8'
          },
          {
            id: 'iwatch-universal-movies',
            name: 'Universal Movies',
            logo: 'https://i.imgur.com/0rq9qX4.png',
            category: 'Movies',
            url: 'https://d4whmvwm0rdvi.cloudfront.net/10007/99991621/hls/master.m3u8?ads.xumo_channelId=99991621&ads.asnw=169843&ads.afid=158702674&ads.sfid=16926435&ads.csid=xumo_desktopweb_rottentomatoesrttv_ssaicro&ads._fw_is_lat=0&ads._fw_us_privacy=1YNN&ads._fw_coppa=0&ads._fw_did=413d7e29-b63e-b34e-b143-bf0efe32f394&ads._fw_vcid2=512116:413d7e29-b63e-b34e-b143-bf0efe32f394&ads._fw_app_bundle=&ads._fw_app_store_url=&ads._fw_content_category=IAB1-5&ads._fw_content_genre=Movies&ads._fw_content_language=en&ads._fw_content_rating=TV-PG&ads._fw_deviceMake=&ads._fw_device_model=&ads._fw_deviceType=2-Personal_Computer&ads.appVersion=2.18.0&ads.appName=xumo&ads.xumo_contentId=2659&ads.xumo_contentName=RottenTomatoesRTTV&ads.xumo_providerId=2659&ads.xumo_providerName=RottenTomatoesRTTV&ads.channelId=99991621&ads._fw_ifa_type=dpid&ads.site_name=XumoPlay&ads.site_page=https%253A%252F%252Fplay.xumo.com'
          },
          {
            id: 'iwatch-dove-channel',
            name: 'Dove Channel',
            logo: 'https://i.ibb.co/t3dXphQ/download-2024-06-27-T073317-555.png',
            category: 'Entertainment',
            url: 'https://linear-896.frequency.stream/dist/xumo/896/hls/master/playlist_1280x720.m3u8'
          },
          {
            id: 'iwatch-ragetv',
            name: 'Rage TV',
            logo: 'https://i.imgur.com/E3q2kTu.png',
            category: 'Entertainment',
            url: 'https://live20.bozztv.com/giatv/giatv-ragetv/ragetv/chunks.m3u8'
          },
          {
            id: 'iwatch-comicu',
            name: 'Comic U',
            logo: 'https://i.imgur.com/ziTlvlL.jpeg',
            category: 'Entertainment',
            url: 'https://amg19223-amg19223c8-amgplt0351.playout.now3.amagi.tv/playlist/amg19223-amg19223c8-amgplt0351/playlist.m3u8'
          },
          {
            id: 'iwatch-bilyonaryo',
            name: 'Bilyonaryo',
            logo: 'https://i.imgur.com/W00t4Qn.png',
            category: 'News',
            url: 'https://amg19223-amg19223c11-amgplt0352.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg19223-amg19223c11-amgplt0352/playlist.m3u8'
          },
          {
            id: 'iwatch-red-box-movies',
            name: 'Red Box Movies',
            logo: 'https://i.imgur.com/OrGCnPg.jpg',
            category: 'Movies',
            url: 'https://7732c5436342497882363a8cd14ceff4.mediatailor.us-east-1.amazonaws.com/v1/master/04fd913bb278d8775298c26fdca9d9841f37601f/Plex_NewMovies/playlist.m3u8'
          },
          {
            id: 'skygo-warner-tv',
            name: 'Warner TV',
            logo: 'https://i.imgur.com/Q4NhDKm.png',
            category: 'Entertainment',
            url: 'https://cdn4.skygo.mn/live/disk1/Warner/HLSv3-FTA/Warner-avc1_2089200=7-mp4a_256000_eng=6.m3u8'
          },
          {
            id: 'iwatch-dubai-one',
            name: 'Dubai One',
            logo: 'https://i.ibb.co/rvWwhkx/download-31.png',
            category: 'Entertainment',
            url: 'https://dminnvllta.cdn.mgmlcdn.com/dubaione/smil:dubaione.stream.smil/chunklist_b1300000.m3u8'
          },
          {
            id: 'iwatch-asian-crush',
            name: 'Asian Crush',
            logo: 'https://i.imgur.com/fUg91vw.jpeg',
            category: 'Movies',
            url: 'https://cineverse.g-mana.live/media/1ebfbe30-c35c-4404-8bc5-0339d750eb58/mainManifest.m3u8?app_bundle=https://www.asiancrush.com&app_name=asiancrush&app_store_url=&url=https://www.asiancrush.com&genre=Documentary,Independent,Sci-Fi%20&%20Fantasy,Kids%20&%20Family,Drama,Romance,Comedy,Action%20&%20Adventure,Sports&ic=&us_privacy=1YNN&gdpr=0&gdpr_consent=0&did=vir_webe2f1f1c449b2b43d72e1a991a25f2666&dnt=1&coppa=0'
          },
          {
            id: 'shakzz-moonbug',
            name: 'Moonbug Kids',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Moonbug2ndLogo.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_moonbug_kids_sd/default/index.mpd',
            licenseKey: '0bf00921bec94a65a124fba1ef52b1cd:0f1488487cbe05e2badc3db53ae0f29f'
          },
          {
            id: 'shakzz-tap-sports',
            name: 'Tap Sports',
            logo: 'https://i.imgur.com/ZsWDiRF.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_tapsports/default/index.mpd',
            licenseKey: 'eabd2d95c89e42f2b0b0b40ce4179ea0:0e7e35a07e2c12822316c0dc4873903f'
          },
          {
            id: 'shakzz-spotv',
            name: 'SPOTV',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257286_thumb-spotv.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotvhd/default/index.mpd',
            licenseKey: 'ec7ee27d83764e4b845c48cca31c8eef:9c0e4191203fccb0fde34ee29999129e'
          },
          {
            id: 'shakzz-spotv2',
            name: 'SPOTV 2',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257305_thumb-spotv-2.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotv2hd/default/index.mpd',
            licenseKey: '7eea72d6075245a99ee3255603d58853:6848ef60575579bf4d415db1032153ed'
          },
          {
            id: 'shakzz-rock-action',
            name: 'Rock Action',
            logo: 'https://uploads-ssl.webflow.com/64e961c3862892bff815289d/64f57100366fe5c8cb6088a7_logo_ext_web.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockextreme/default/index.mpd',
            licenseKey: '0f852fb8412b11edb8780242ac120002:4cbc004d8c444f9f996db42059ce8178'
          },
          {
            id: 'shakzz-paramount',
            name: 'Paramount Movies',
            logo: 'https://logodownload.org/wp-content/uploads/2014/07/paramount-logo-1.png',
            url: 'https://stitcher.pluto.tv/stitch/hls/channel/5cb0cae7a461406ffe3f5213/master.m3u8?deviceType=web&servertSideAds=false&deviceMake=safari&deviceVersion=1&deviceId=spencer&appVersion=1&deviceDNT=0&deviceModel=web&sid=4a87ffde-1b23-11f0-bc66-96648866fcff'
          },
          {
            id: 'shakzz-al-jazeera',
            name: 'Al Jazeera',
            logo: 'https://www.liblogo.com/img-logo/al1049a118-al-jazeera-logo-al-jazeera-to-deliver-bloomberg-news-content-for-expanded-global.png',
            url: 'https://linearjitp-playback.astro.com.my/dash-wv/linear/2110/default_ott.mpd',
            licenseKey: 'sfvQh055I/WwWSmgQqoGEA:bDxJgROr/99FTck1MZp5TQ'
          },
          {
            id: 'shakzz-cna',
            name: 'Channel News Asia',
            logo: 'https://logowik.com/content/uploads/images/cna-channel-news-asia9392.jpg',
            url: 'https://tglmp03.akamaized.net/out/v1/43856347987b4da3890360b0d18b5dc5/manifest.mpd',
            licenseKey: '4ee336861eed4840a555788dc54aea6e:f1f53644d4941d4ed31b4bb2478f8cf4'
          },
          {
            id: 'shakzz-food-network',
            name: 'Food Network',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Food_Network_logo.svg/1200px-Food_Network_logo.svg.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/asianfoodnetwork_sd/default/index.mpd',
            licenseKey: 'b7299ea0af8945479cd2f287ee7d530e:b8ae7679cf18e7261303313b18ba7a14'
          },
          {
            id: 'shakzz-lifetime',
            name: 'Lifetime',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Logo_Lifetime_2020.svg/2560px-Logo_Lifetime_2020.svg.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_lifetime/default/index.mpd',
            licenseKey: 'cf861d26e7834166807c324d57df5119:64a81e30f6e5b7547e3516bbf8c647d0'
          },
          {
            id: 'shakzz-fashion-tv',
            name: 'Fashion TV',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fashion_TV_logo_2017.svg/1200px-Fashion_TV_logo_2017.svg.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/fashiontvhd/default/index.mpd',
            licenseKey: '971ebbe2d887476398e97c37e0c5c591:472aa631b1e671070a4bf198f43da0c7'
          }
        ];

        setChannels([...manualChannels, ...parsed]);
      } catch (err) {
        console.error('Error fetching IPTV playlist:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylist();
  }, []);

  // Filter channels by search and status
  const filteredChannels = useMemo(() => {
    return channels.filter((channel) => {
      const matchesSearch = channel.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === 'All'
        ? true
        : categoryFilter === 'Favorites'
          ? favorites.includes(channel.id)
          : (channel.category || 'Entertainment') === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [channels, searchQuery, categoryFilter, favorites]);

  // key categories Entertainment, Movies, News, Sports, Kids, Documentary, and Pinoy
  const categories = ['Favorites', 'Entertainment', 'Movies', 'News', 'Sports', 'Kids', 'Documentary', 'Pinoy'];

  const getCategoryCount = (cat) => {
    if (cat === 'Favorites') return favorites.length;
    return channels.filter(c => (c.category || 'Entertainment') === cat).length;
  };

  // Count live and offline
  const liveCount = channels.length - offlineChannels.length;
  const offlineCount = offlineChannels.length;

  const handleChannelClick = (channel) => {
    navigate(`/iptv/watch/${channel.id}`, {
      state: { channel },
    });
  };

  const handleMarkLive = (e, channelId) => {
    e.stopPropagation();
    const updated = offlineChannels.filter(id => id !== channelId);
    setOfflineChannels(updated);
    saveOfflineChannels(updated);
  };

  const toggleFavorite = (e, channelId) => {
    e.stopPropagation();
    let updated;
    if (favorites.includes(channelId)) {
      updated = favorites.filter(id => id !== channelId);
    } else {
      updated = [...favorites, channelId];
    }
    setFavorites(updated);
    saveFavorites(updated);
  };

  if (loading) {
    return (
      <div className="iptv-page">
        <div className="iptv-loading">
          <div className="loading-spinner"></div>
          <p>Loading channels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="iptv-page">
        <div className="iptv-error">
          <h2>Failed to load channels</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="iptv-page">
      <div className="iptv-header">
        <h1>Live TV</h1>
        <p className="iptv-subtitle">{channels.length} channels available</p>
        <p className="iptv-description">
          Live TV. Any time. Everywhere. Access an ever-growing selection of news, sports, and entertainment. Stay connected to the world with premium live broadcasts at your fingertips.
        </p>
      </div>

      <div className="iptv-filters">
        <div className="iptv-search-container">
          <svg
            className="iptv-search-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="iptv-search-input"
            placeholder="Search TV Channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="iptv-category-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="All">All ({channels.length})</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat} ({getCategoryCount(cat)})</option>
          ))}
        </select>
      </div>

      <div className="iptv-grid">
        {filteredChannels.map((channel) => {
          const isOffline = offlineChannels.includes(channel.id);
          return (
            <div
              key={channel.id}
              className={`iptv-channel-card${isOffline ? ' iptv-channel-offline' : ''}`}
              onClick={() => handleChannelClick(channel)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleChannelClick(channel)}
            >
              <button
                className={`iptv-favorite-btn ${favorites.includes(channel.id) ? 'active' : ''}`}
                onClick={(e) => toggleFavorite(e, channel.id)}
                title={favorites.includes(channel.id) ? "Remove from Favorites" : "Add to Favorites"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={favorites.includes(channel.id) ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-star"
                >
                  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>
                </svg>
              </button>

              {isOffline && (
                <button
                  className="iptv-mark-live-btn"
                  onClick={(e) => handleMarkLive(e, channel.id)}
                  title="Mark as Live"
                >
                  ↻
                </button>
              )}
              <div className="iptv-channel-logo-container">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    className="iptv-channel-logo"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="iptv-channel-logo-fallback"
                  style={{ display: channel.logo ? 'none' : 'flex' }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z" />
                  </svg>
                </div>
              </div>
              <div className="iptv-channel-info">
                <h3 className="iptv-channel-name">{channel.name}</h3>
              </div>
            </div>
          );
        })}
      </div>

      {
        filteredChannels.length === 0 && (
          <div className="iptv-no-results">
            <p>No channels found matching your criteria</p>
          </div>
        )
      }
    </div >
  );
};

export default IPTV;
