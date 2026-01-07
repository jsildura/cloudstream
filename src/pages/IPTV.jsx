import React, { useState, useEffect, useMemo, useRef } from 'react';
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

          //  {
          //    id: 'mapple-amc',
          //   name: 'AMC USA',
          //   logo: '/channels/amc_logo.png',
          //    url: 'https://nfsnew.kiko2.ru/nfs/premium303/mono.css',
          //  mappleId: '303',
          //  licenseType: 'clearkey' // Dynamic via harvester
          //  }, 

          // {
          //  id: 'mapple-ahc',
          //  name: 'AHC (American Heroes Channel)',
          //  logo: '/channels/American_Heroes_Channel_logo.png',
          //  category: 'Documentary',
          //  url: 'https://ddy6new.kiko2.ru/ddy6/premium206/mono.css',
          //  mappleId: '206',
          //  licenseType: 'clearkey'
          // },
          // === SHAKZZ CHANNELS (ClearKey - works on mobile!) ===

          // Movies
          {
            id: 'cinema-one',
            name: 'Cinema One',
            logo: 'https://download.logo.wine/logo/Cinema_One/Cinema_One-Logo.wine.png',
            category: 'Movies',
            url: 'https://d9rpesrrg1bdi.cloudfront.net/out/v1/93b9db7b231d45f28f64f29b86dc6c65/index.mpd',
            licenseKey: '58d0e56991194043b8fb82feb4db7276:d68f41b59649676788889e19fb10d22c'
          },
          // Documentary
          {
            id: 'bbc-earth',
            name: 'BBC Earth',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/BBC_Earth.svg',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_bbcearth_hd1/default/index.mpd',
            licenseKey: '34ce95b60c424e169619816c5181aded:0e2a2117d705613542618f58bf26fc8e'
          },
          // Entertainment
          {
            id: 'axn',
            name: 'AXN',
            logo: 'https://icon2.cleanpng.com/20180702/pfc/kisspng-axn-television-channel-sony-channel-television-sho-axn-5b3a0ac39f5e85.1062681315305304996528.jpg',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_axn_sd/default/index.mpd',
            licenseKey: 'fd5d928f5d974ca4983f6e9295dfe410:3aaa001ddc142fedbb9d5557be43792f'
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
            id: 'amc-thrillers',
            name: 'AMC Thrillers',
            logo: 'https://provider-static.plex.tv/6/epg/channels/logos/gracenote/6e7af423114c9f735d17e142783f233a.png',
            category: 'Movies',
            url: 'https://436f59579436473e8168284cac5d725f.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/Plex_RushByAMC/playlist.m3u8'
          },
          {
            id: 'anime-hidive',
            name: 'Anime X Hidive',
            logo: 'https://www.tablotv.com/wp-content/uploads/2023/12/AnimeXHIDIVE_official-768x499.png',
            category: 'Kids',
            url: 'https://amc-anime-x-hidive-1-us.tablo.wurl.tv/playlist.m3u8'
          },
          {
            id: 'animex',
            name: 'AnimeX',
            logo: 'https://logomakerr.ai/uploads/output/2023/08/01/8d87f4803925f46fcdb6b9ae8a1e6244.jpg',
            category: 'Kids',
            url: 'https://live20.bozztv.com/giatv/giatv-animex/animex/chunks.m3u8'
          },
          {
            id: 'angry-birds',
            name: 'Angry Birds',
            logo: 'https://www.pikpng.com/pngl/m/83-834869_angry-birds-theme-angry-birds-game-logo-png.png',
            category: 'Kids',
            url: 'https://stream-us-east-1.getpublica.com/playlist.m3u8?network_id=547'
          },
          {
            id: 'kidoodle',
            name: 'Kidoodle TV',
            logo: 'https://d1iiooxwdowqwr.cloudfront.net/pub/appsubmissions/20201230211817_FullLogoColor4x.png',
            category: 'Kids',
            url: 'https://amg07653-apmc-amg07653c5-samsung-ph-8539.playouts.now.amagi.tv/playlist.m3u8'
          },
          // Added: ABC, AMC+, ANC + Others
          {
            id: 'abc-australia',
            name: 'ABC Australia',
            logo: 'https://i.pinimg.com/736x/5a/66/65/5a666508bc5851a6a9c1151e7eefff3d.jpg',
            category: 'News',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/abc_aus/default/index.mpd',
            licenseKey: '389497f9f8584a57b234e27e430e04b7:3b85594c7f88604adf004e45c03511c0'
          },
          {
            id: 'amc-plus',
            name: 'AMC+',
            logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png?v=1650990755',
            category: 'Entertainment',
            url: 'https://bcovlive-a.akamaihd.net/ba853de442c140b7b3dc020001597c0a/us-east-1/6245817279001/profile_0/chunklist.m3u8'
          },
          {
            id: 'anc',
            name: 'ANC',
            logo: 'https://data-corporate.abs-cbn.com/corp/medialibrary/dotcom/corp news sports 2020/anc station id/anc goes global_2.jpg',
            category: 'News',
            url: 'https://d3cjss68xc4sia.cloudfront.net/out/v1/89ea8db23cb24a91bfa5d0795f8d759e/index.mpd',
            licenseKey: '4bbdc78024a54662854b412d01fafa16:6039ec9b213aca913821677a28bd78ae'
          },
          // === NEW ADDITIONS (Pinoy, Sports, Entertainment) ===
          {
            id: 'gma7',
            name: 'GMA 7',
            logo: 'https://ottepg8.comclark.com:8443/iptvepg/images/markurl/mark_1723126306082.png',
            category: 'Pinoy',
            url: 'https://gsattv.akamaized.net/live/media0/gma7/Widevine/gma7.mpd'
          },
          {
            id: 'red-bull',
            name: 'Red Bull TV',
            logo: 'https://i.imgur.com/Ju6FJNA.png',
            category: 'Sports',
            url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8'
          },
          {
            id: 'uaap-varsity-channel',
            name: 'UAAP Varsity Channel',
            logo: 'https://i.imgur.com/V0sxXci.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_uaap_cplay_sd/default/index.mpd',
            licenseKey: '95588338ee37423e99358a6d431324b9:6e0f50a12f36599a55073868f814e81e'
          },
          {
            id: 'jeepney-tv',
            name: 'Jeepney TV',
            logo: 'https://upload.wikimedia.org/wikipedia/en/1/15/Jeepney_TV_Logo_2015.svg',
            category: 'Pinoy',
            url: 'https://abslive.akamaized.net/dash/live/2027618/jeepneytv/manifest.mpd',
            licenseKey: 'dc9fec234a5841bb8d06e92042c741ec:225676f32612dc803cb4d0f950d063d0'
          },
          {
            id: 'rock-entertainment',
            name: 'Rock Entertainment',
            logo: 'https://i.imgur.com/fx1Y2Eh.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockentertainment/default/index.mpd',
            licenseKey: 'e4ee0cf8ca9746f99af402ca6eed8dc7:be2a096403346bc1d0bb0f812822bb62'
          },
          {
            id: 'aniplus',
            name: 'Aniplus',
            logo: 'https://i.imgur.com/TXTluER.png',
            category: 'Kids',
            url: 'https://amg18481-amg18481c1-amgplt0352.playout.now3.amagi.tv/playlist/amg18481-amg18481c1-amgplt0352/playlist.m3u8'
          },
          {
            id: 'zoomoo',
            name: 'Zoo Moo Asia',
            logo: 'https://ia803207.us.archive.org/32/items/zoo-moo-kids-2020_202006/ZooMoo-Kids-2020.png',
            category: 'Kids',
            url: 'https://zoomoo-samsungau.amagi.tv/playlist.m3u8'
          },
          {
            id: 'premier-league',
            name: 'Premier League',
            logo: 'https://logos-world.net/wp-content/uploads/2023/02/Premier-League-Logo-2007.png',
            category: 'Sports',
            url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc1021n07j)/master.mpd',
            licenseKey: '002046c9a49b9ab1cdb6616bec5d26c3:d2f92f6b7edc9a1a05d393ba0c20ef9e'
          },
          {
            id: 'bbc-news',
            name: 'BBC News',
            category: 'News',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BBC_News_2022_(Alt).svg/1200px-BBC_News_2022_(Alt).svg.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/bbcworld_news_sd/default/index.mpd',
            licenseKey: 'f59650be475e4c34a844d4e2062f71f3:119639e849ddee96c4cec2f2b6b09b40'
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
          // === Source Live Play ===
          {
            id: 'warner-tv',
            name: 'Warner TV',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Warner2018LA.png',
            category: 'Movies',
            url: 'https://unifi-live2.secureswiftcontent.com/Content/DASH/Live/channel(WarnerTV)/master.mpd',
            licenseKey: '6f4ea7be45af4275a8d76845fb19dba5:b02208ea61a2cdbf5b09440bc3157f04'
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
            id: 'spotv',
            name: 'SPOTV',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257286_thumb-spotv.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotvhd/default/index.mpd',
            licenseKey: 'ec7ee27d83764e4b845c48cca31c8eef:9c0e4191203fccb0fde34ee29999129e'
          },
          {
            id: 'spotv2',
            name: 'SPOTV 2',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257305_thumb-spotv-2.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotv2hd/default/index.mpd',
            licenseKey: '7eea72d6075245a99ee3255603d58853:6848ef60575579bf4d415db1032153ed'
          },
          {
            id: 'rock-action',
            name: 'Rock Action',
            logo: 'https://uploads-ssl.webflow.com/64e961c3862892bff815289d/64f57100366fe5c8cb6088a7_logo_ext_web.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockextreme/default/index.mpd',
            licenseKey: '0f852fb8412b11edb8780242ac120002:4cbc004d8c444f9f996db42059ce8178'
          },
          {
            id: 'cna',
            name: 'Channel News Asia',
            logo: 'https://logowik.com/content/uploads/images/cna-channel-news-asia9392.jpg',
            category: 'News',
            url: 'https://tglmp03.akamaized.net/out/v1/43856347987b4da3890360b0d18b5dc5/manifest.mpd',
            licenseKey: '4ee336861eed4840a555788dc54aea6e:f1f53644d4941d4ed31b4bb2478f8cf4'
          },
          // === Source LivePlay ===
          {
            id: 'kapatid-channel',
            name: 'Kapatid Channel',
            category: 'Entertainment',
            logo: 'https://liveplay.vercel.app/assets/kapatid_channel_logo.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pphd_sdi1/default/index.mpd',
            licenseKey: 'dbf670bed2ea4905a114557e90e7ffb6:616059bec8dfb27f3524b7e7c31b6cff'
          },
          {
            id: 'wiltv',
            name: 'Wil TV',
            category: 'Entertainment',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/WILTV_logo.svg/500px-WILTV_logo.svg.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/wiltv/default/index.mpd',
            licenseKey: 'b1773d6f982242cdb0f694546a3db26f:ae9a90dbea78f564eb98fe817909ec9a'
          },
          {
            id: 'crave-1',
            name: 'Crave',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave1.png',
            url: 'https://live-crave.video.9c9media.com/137c6e2e72e1bf67b82614c7c9b216d6f3a8c8281748505659713/fe/f/crave/crave1/manifest.mpd',
            licenseKey: '4a107945066f45a9af2c32ea88be60f4:df97e849d68479ec16e395feda7627d0'
          },
          {
            id: 'crave-2',
            name: 'Crave 2',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave2.png',
            url: 'https://live-crave.video.9c9media.com/ab4332c60e19b6629129eeb38a2a6ac6db5df2571721750022187/fe/f/crave/crave2/manifest.mpd',
            licenseKey: '4ac6eaaf0e5e4f94987cbb5b243b54e8:8bb3f2f421f6afd025fa46c784944ad6'
          },
          {
            id: 'crave-3',
            name: 'Crave 3',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave3.png',
            url: 'https://live-crave.video.9c9media.com/58def7d65f59ffaf995238981dd0e276d5a8fe8d1748593014588/fe/f/crave/crave3/manifest.mpd',
            licenseKey: 'eac7cd7979f04288bc335fc1d88fa344:0fca71cf91b3c4931ad3cf66c631c24c'
          },
          {
            id: 'crave-4',
            name: 'Crave 4',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave4.png',
            url: 'https://live-crave.video.9c9media.com/c5875a31f178e038f7cc572b1aa0defb996ce7171748593186018/fe/f/crave/crave4/manifest.mpd',
            licenseKey: 'a7242a7026ff45609114ee1f3beb34dc:65c32ada65548203a3683d5d37dd3a06'
          },
          {
            id: 'bein-sports1',
            name: 'BeIN Sports 1',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Logo_bein_sports_1.png/1200px-Logo_bein_sports_1.png',
            url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/ghwcl6hv68/out/v1/83536910d8034e9b9895a20fbe1c1687/cenc.mpd',
            licenseKey: '335dad778109954503dcbb21dc92015f:24bfd75d436cbf73168a2a2dccd40281'
          },
          {
            id: 'bein-sports2',
            name: 'BeIN Sports 2',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Logo_bein_sports_2.png/1200px-Logo_bein_sports_2.png',
            url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/8m8cd46i1t/out/v1/83985c68e4174e90a58a1f2c024be4c9/cenc.mpd',
            licenseKey: '0b42be2664d7e811d04f3e504e0924c5:ae24090123b8c72ac5404dc152847cb8'
          },
          {
            id: 'bein-sports3',
            name: 'BeIN Sports 3',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Logo_bein_sports_3.png/1200px-Logo_bein_sports_3.png',
            url: 'https://aba5sdmaaaaaaaamhq2w5oosrf5ae.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/dash/enc/q4u5nwaogz/out/v1/18de6d3e65934f3a8de4358e69eab86c/cenc.mpd',
            licenseKey: '7995c724a13748ed970840a8ab5bb9b3:67bdaf1e2175b9ff682fcdf0e2354b1e'
          },
          {
            id: 'eurosport-1',
            name: 'Eurosport 1',
            category: 'Sports',
            logo: '	https://liveplay.vercel.app/assets/eurosport1_logo.svg',
            url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561802/index.mpd',
            licenseKey: '01a665d487aa4c1c898c9eb0ff1a21df:a0b9df5f92e6b218ddb6aa40a2cd996d'
          },
          {
            id: 'eurosport-2',
            name: 'Eurosport 2',
            category: 'Sports',
            logo: 'https://liveplay.vercel.app/assets/eurosport2_logo.svg',
            url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561705/index.mpd',
            licenseKey: '657707bbd1e240e08bd6969df27fef7c:364e00581c1432f4175e4a2e8e0cd57e'
          },
          {
            id: 'nfl-network',
            name: 'NFL Network',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/National_Football_League_logo.svg/873px-National_Football_League_logo.svg.png',
            url: 'https://ac-009.live.p7s1video.net/e0e064c8/t_004/ran-nflnetwork-de-hd/cenc-default.mpd',
            licenseKey: 'b26a662a10074eb0756404c8e90e765a:76e376bd25f92bed939435d982f92d3f'
          },
          {
            id: 'fifa',
            name: 'Fifa',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_%282025%29.svg/2560px-FIFA%2B_%282025%29.svg.png',
            url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000000/0/HLS/playlist_3000k_20251020T100738.m3u8'
          },
          {
            id: 'tsn-1',
            name: 'TSN 1',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn1-light.webp',
            url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000000/0/HLS/playlist_3000k_20251020T100738.m3u8',
            licenseKey: '7e99f734748d098cbfa2f7bde968dd44:98ea6088c3222e9abaf61e537804d6cc'
          },
          {
            id: 'tsn-2',
            name: 'TSN 2',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn2-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/v5v9yfn62i/out/v1/0991e33d09da46b2857fcc845db95c40/cenc.mpd',
            licenseKey: '362202eefc5d9e42eec6450998cce9e8:978dfdd53186ec587d940e0bd1e2ec42'
          },
          {
            id: 'tsn-3',
            name: 'TSN 3',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn3-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mrskysvotx/out/v1/ad58961bd8fd48d2944e461c034b8914/cenc.mpd',
            licenseKey: 'd9097a1b7d04b7786b29f2b0e155316d:279695ebe0fb1bc5787422b6b59ce8a8'
          },
          {
            id: 'tsn-4',
            name: 'TSN 4',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn4-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/irtfdsri14/out/v1/165128c314e944faa3d79e107974b323/cenc.mpd',
            licenseKey: 'e1aa4c4daf6222a04f7ae80130495ea1:31bb1ee9a8d088f62b0103550c301449'
          },
          {
            id: 'tsn-5',
            name: 'TSN 5',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn5-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mttgh1c4ei/out/v1/9cc664b146744e2ba23066aa048efbc5/cenc.mpd',
            licenseKey: '8ce20e2a4b3dd04e0a6e5469b7cb47be:163c323b65d0597b13f037641fd67b1e'
          },
          {
            id: 'bbc-cbeebies',
            name: 'BBC CBeebies',
            category: 'Kids',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/CBeebies_logo_with_outline.svg/1200px-CBeebies_logo_with_outline.svg.png',
            url: 'https://viamotionhsi.netplus.ch/live/eds/bbc4cbeebies/browser-dash/bbc4cbeebies.mpd'
          },
          {
            id: 'myx',
            name: 'MYX',
            category: 'Music',
            logo: 'https://assets-myxglobal.abs-cbn.com/wp-content/uploads/2022/07/MYX_New_Logo_Web1.png',
            url: 'https://d24xfhmhdb6r0q.cloudfront.net/out/v1/e897a7b6414a46019818ee9f2c081c4f/index.mpd'
          },
          {
            id: 'vevopop',
            name: 'Vevopop',
            category: 'Music',
            logo: 'https://liveplay.vercel.app/assets/vevopop_logo.svg',
            url: 'https://amg00056-amg00056c6-rakuten-uk-3235.playouts.now.amagi.tv/1080p/index.m3u8'
          },
          {
            id: 'mtv-live-us',
            name: 'MTV Live US',
            category: 'Music',
            logo: 'https://static.wikia.nocookie.net/logopedia/images/5/58/MTV_Live_%28orange%29.svg',
            url: 'https://fl1.moveonjoy.com/MTV_LIVE/manifest.mpd'
          },
          {
            id: 'kix',
            name: 'KIX',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/KIX_logo.svg',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/kix_hd1/default/index.mpd',
            licenseKey: 'a8d5712967cd495ca80fdc425bc61d6b:f248c29525ed4c40cc39baeee9634735'
          },
          {
            id: 'animal-planet-hd-in',
            name: 'Animal Planet HD (IN)',
            category: 'Documentary',
            logo: 'https://wildaid.org/wp-content/uploads/2021/08/animal-planet-logo-white.png',
            url: 'https://d1g8wgjurz8via.cloudfront.net/bpk-tv/Animalplanethd2/default/index.mpd',
            licenseKey: 'df81f15150f74c799fdde64ef49dfb75:05794a012ae74d77953f2b9fae6804c7'
          },
          {
            id: 'love-nature',
            name: 'Love Nature',
            category: 'Documentary',
            logo: 'https://blueantmedia.com/wp-content/uploads/2025/02/LoveNature2024_Logo_Coral-768x304.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/dub-nitro/live/dash/enc/utcsjvt6qk/out/v1/8ee87ae683ec4b458720621cb2244937/cenc.mpd',
            licenseKey: 'cec4c3c055a7f7e496cbe3abe06ae7c3:6b96bdc30b53ae19d40b4e17c66e5afd'
          },
          {
            id: 'pbb-all-access',
            name: 'PBB All Access',
            category: 'Entertainment',
            logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png',
            url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-pbb-live-dash-abscbnono/index.mpd'
          },
          {
            id: 'pbb-catch-up-livestream',
            name: 'PBB Catch-Up Livestream',
            category: 'Entertainment',
            logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png',
            url: 'https://abslive.akamaized.net/dash/live/2032648/event2/manifest.mpd',
            licenseKey: 'b93c215d3a8042f883acff6444c9f087:056b82112064371cae8c047fe65e9a26'
          },
          {
            id: 'yourface-sounds-familiar-catch-up-livestream',
            name: 'Yourface Sounds Familiar Catch-Up Livestream',
            category: 'Entertainment',
            logo: 'https://pql-static.abs-cbn.com/images/master/YFSF_LIVETITLETREATMENT_2025_V1_png_20251003100022.png',
            url: 'https://abslive.akamaized.net/dash/live/2027618/event4-3/manifest.mpd',
            licenseKey: '3b38b047c273424dbe1b9c64468f9bbb:40703c379a41bf95eb84d620fd718bd4'
          },
          {
            id: 'sea-games-ph-total-sports',
            name: 'Sea Games PH Total Sports',
            category: 'Sports',
            logo: 'https://pilipinaslive.com/assets/images/logo/pilipinaslive-logo.svg',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pp_ch2_pri/default/index.mpd',
            licenseKey: '4fef00332d7e4fbc8f7005dfbf851a59:a6368c181358f3e527411a6c452c6a1a'
          },

          // Latest Channels Added - Source Deprecated
          {
            id: 'national-geographic',
            name: 'National Geographic',
            category: 'Documentary',
            logo: '/channels/national_geographic.png',
            url: 'https://fl31.moveonjoy.com/National_Geographic/index.m3u8'
          },
          {
            id: 'nat-geo-wild',
            name: 'Nat Geo Wild',
            logo: '/channels/national_geo_wild.png',
            url: 'https://fl1.moveonjoy.com/Nat_Geo_Wild/index.m3u8'
          },

          // Source www.distro.tv/live
          {
            id: 'wild-nature',
            name: 'Wild Nature',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wild-nature/logo_20250401_214215_70.png',
            url: 'https://dg5rg8emlfy55.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildNature2/491.m3u8'
          },
          {
            id: 'euronews',
            name: 'Euronews (EN)',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/22886/euronews/logo_20231218_175557_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/manifest/0bc8e8376bd8417a1b6761138aa41c26c7309312/euronews/316027a1-87ae-45ad-9535-9f3d05ad2c0b/5.m3u8'
          },
          {
            id: 'unleashed-dogtv',
            name: 'Unleashed by DOGTV',
            category: 'Reality',
            logo: 'https://a.jsrdn.com/hls/23231/unleashed-by-dogtv/logo_20251030_220003_68.png',
            url: 'https://amg26269-amg26269c2-distrotv-us-8939.playouts.now.amagi.tv/ts-us-e2-n1/playlist/amg26269-dogtv-unleashedbydogtv-distrotvus/cb543d1e786c648e9dd43765cef043a2f9591fde1d6988693eb5518975d1073edce2a59caa08ff16388f1ede7f0a66413a3e951fda77118fd87eb141453c5728cfffe729a2c05616b7db083429b56a062a866a68ac39437ed0e21f48a238b6720a5aa82a66443d80b846ac7251db80148b61299bce8c37683f03409a5e5afba358b1ebe85e468b6af7b94a55c07d4de39f43c8821ca6d1860dcb5ed270f710cc9bf88b821985849b729368e3301a16236d89bf6f96db4ebfd5941b57f61d7a164c04b6f6c2ad1f6cd2161927928ecabb76b116de80368e643289018c468a37f80dc06d93d70387f7f3b532403db78a5e712eb3eaa48fef3c27b16389d683af467295f3156b4fcc6998203278b4d2ec20b29946fcdf2281a7271836d6ae4ce9dbd8c7b6e6d51a9e239297b9c93b14192e5051d20bef9b358c71907bfa9b1220591e1dfe9c0796dca23442634b95ce5ad10512badea882cb0b3cc57202288d0aba4c006e964c0612e429ead42f789b230b882124eb5d47e62898b425e3a2819f6c55b4dad40cfa7fe6a605d6f33da0694e3168d5a3780c131a2e8a9c0c66317dd00be3d6c5d56e19059e94a79f9209476d4116561fc5e6e266928dc50a1218cf5625747d1f19a21dc66cad6323617c936db9c6087096482928efa037492809fcabe0d9d78c852edb7ed7dcb33a20354d66b327103462a1cbe722f52c5f6e6907cf407354aa495e4bf981dbead7947881906dbc3d2d4e15af9816451a1c7d62079ee202bd36c69a0ead89c568fab5f978228438b04f1c9fc4ae05928ad8891657c9f8074310fdbd26c16063c312c2228bd75dd9bb50747956237fc78c0e8b35d4de9ed4659e29bb46007bce568fee80d9b7360c90fb2232371a1b1b705c715e67d2b384365235b4ec7fbe0dbc9e3fc24350207154d68d17618fec057af6512b33f2f491cac7a70214d920f779c0650db268043e93bc5284d2e2a0b4d63f034e81e5e51de8f3d2eea6b1cb226d456b3594b33b3f15e80eaae36d89ac196fa18e8ff5c81cf41f8365e1fbdc5ae538b385bf01a08498f0ef48134b4856e8c8f8f466bcd66f14e32b8b1d7760f6e4e5f076b5c9b4086fd85cf48c0969dc581439fd9db6239269d289382ef4c96849c55733d5e5f8290ed156c84a5f78ffd9847c2fceca019e489581ad4a26e1091af7094d69a36bee8eab656a93c8797264e307028d648ccddd1c5b6beeb649021e3b566763b841583faa2963a10eba9687db0b73dc51d07255cd78abd119b4aa03f9d0c5e7abe23777aef21f649565822298019f8fd58952c35265b926831466d4b9b69ad9fbd2b3958c7433199257d50ecd7888c3dbd71f422f74ca0a295e29f513ce0e0747d8e85ccca25e789fd2f84ff30340564e313ec815b78f1d123449e3e7798e936371656526edb165dd72e51fe2e53d1bbc1e7c5c14024b56ad85c908ac30b660b5fb5e40f584a5a728f3e03bd19bc6e7be5f01c1576a4a479ef78d94d84023f59b98dd316786ab71ba007c3a38cedead407bd5c0282ff6a79e67f7b86c805826056bd18dbd26de33863ded1f4cce34c3f6487e819d19207b863e84ca3f51a349a60a058517e02631d113791649228a31c66801292de279d58ccc362501974bd95a6738aed2f990a35f35777d0450743a29419c2a53d1093a0ba11730bac5e8add5858e0b292ce542bfcc83844a4af8f0d790845ff44b8a979bccb09adbc24a7d39d7495cc016a0091e8c8613d2778585d69d2b04ba8a38c71f1b349845582196e6490e082d01adeb89229548a916b7b5eee2c87dd2cdf861555c97ace421a51fed4e412a63cf7690cc2c2be0b89e6d8464289cd286e1a5a9269683f04dccea374eb294c25ac4a9dc74a43c7125754844588905c942eefe1a80252fb54d662bff23c2346735e0a4d824afba15757a0d6fb436a74b45910dff625d4064c88c14ddadaea3bb3968302fb7964b8a410ca5350042b9bb945134d434f20088eb9593056b1e2e77a3604e7a6fc37768414cbb9e50234a19d77985595ffde0b9940a527fc6cf4dced52e28e9f9ce20e871fb04892aab67195d0689577c36f6727c577028181e072742dffb078dc5e38f22b6a9c6a765f1ac1a91cc662a9bb42e96b01dcb1f61a71d7c8a999d2585225cf6f78cf5220c6ad36f0ba0dd84d60d099a996200db4707d7f9529a56704de9f62e90e2b37957e03ceb7842c3cdc29c36492032c0815ab9a377c5503122705ef98f41d4c721fb928bbafe9c32d9874d5747c23994d862b28dbc0601aec43282e7b56f07a0c078d4749d702aa805bb4d3a866263db273640af6de12bf58ae224b9f30b992f2cf9de771a9836693bc7cfad2ca8107e6a77bd5f6c66482036f5bc1efad2e1f0736148255630365e3a0553c2492fc0f8e255ca7492aa462cf82f3dc85b9e/28/1920x1080_5859480/index.m3u8'
          },
          {
            id: 'pll-network',
            name: 'PLL Network',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22964/pll-network-ww/logo_20240626_232614_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/pll-network-ww/pll.m3u8'
          },
          {
            id: 'mtrspt1',
            name: 'MTRSPT1',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/23099/mtrspt1/logo_20250122_232635_70.png',
            url: 'https://amg02873-kravemedia-mtrspt1-distrotv-mnsrl.amagi.tv/ts-us-w2-n1/playlist/amg02873-kravemedia-mtrspt1-distrotv/playlist.m3u8'
          },
          {
            id: 'motorracing',
            name: 'Motor Racing',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22705/motorracing/logo_20231219_215946_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/manifest/0bc8e8376bd8417a1b6761138aa41c26c7309312/motorracing/301877df-89fb-4935-b20d-c03e7e242eab/2.m3u8'
          },
          {
            id: 'wfnnetwork',
            name: 'WFN: World Fishing Network',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wfn-world-fishing-network/logo_20250911_182344_70.png',
            url: 'https://d3b3ldcvgsu291.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WFN/477.m3u8'
          },
          {
            id: 'horizonsports',
            name: 'Horizon Sports',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22705/horizon-sports/logo_20231219_213910_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/horizon-sports/master.m3u8'
          },
          {
            id: 'daystartv',
            name: 'Daystar TV',
            category: 'Spirituality',
            logo: 'https://a.jsrdn.com/hls/23240/daystar-tv/logo_20251209_232020_69.png',
            url: 'https://hls-live-media-gc.cdn01.net/mpegts/232076_2222904/HMX0lSsFdwYe2y3CWVtL3A/1771632000/master_mpegts.m3u8'
          },
          {
            id: 'elevationchurchnetwork',
            name: 'Elevation Church Network',
            category: 'Spirituality',
            logo: 'https://a.jsrdn.com/hls/23224/elevation-church-network/logo_20250623_165558_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/elevation-church-network/playlist.m3u8'
          },
          {
            id: 'kidstv',
            name: 'Kids TV',
            category: 'Kids',
            logo: 'https://a.jsrdn.com/hls/23088/kids-tv/logo_20231219_214656_61.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/kids-tv/master_en.m3u8'
          },

          {
            id: 'toonzkids',
            name: 'Toonz Kids',
            category: 'Kids',
            logo: 'https://a.jsrdn.com/hls/23131/toonzkids/logo_20231219_223312_67.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/toonzkids/master.m3u8'
          },
          {
            id: 'gusto-tv',
            name: 'Gusto TV',
            category: 'Reality',
            logo: 'https://a.jsrdn.com/hls/23062/gusto-tv/logo_20231219_202519_56.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/gusto-tv/playlist.m3u8'
          },
          {
            id: 'kaloopy',
            name: 'Kaloopy',
            category: 'Entertainment',
            logo: 'https://a.jsrdn.com/hls/22868/kaloopy/logo_20231219_214555_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/kaloopy/master.m3u8'
          },
          {
            id: 'wild-tv',
            name: 'Wild TV',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wild-tv/logo_20250401_215043_70.png',
            url: 'https://d1tm3cz23db55z.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildTV/476.m3u8'
          },
          {
            id: 'true-history',
            name: 'True History',
            category: 'Documentary',
            logo: 'https://a.jsrdn.com/hls/23001/true-history/logo_20231219_223655_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/true-history/playlist.m3u8'
          },
          {
            id: 'AMC',
            name: 'AMC',
            category: 'Movies',
            logo: '/channels/amc_logo.png',
            url: 'https://fl1.moveonjoy.com/AMC_NETWORK/index.m3u8'
          }
        ];

        // Filter out unwanted channels from the parsed cignal.m3u (IDs 5, 6, 78)
        const excludedIds = [5, 6, 78];
        const filteredParsed = parsed.filter(ch => !excludedIds.includes(ch.id));

        const allChannels = [...manualChannels, ...filteredParsed];
        allChannels.sort((a, b) => a.name.localeCompare(b.name));
        setChannels(allChannels);
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

      const isOffline = offlineChannels.includes(channel.id);

      const matchesCategory = categoryFilter === 'All'
        ? !isOffline // 'All' excludes offline channels
        : categoryFilter === 'Favorites'
          ? favorites.includes(channel.id)
          : categoryFilter === 'Offline'
            ? isOffline
            : (channel.category || 'Entertainment') === categoryFilter && !isOffline;

      return matchesSearch && matchesCategory;
    });
  }, [channels, searchQuery, categoryFilter, favorites, offlineChannels]);

  // key categories Entertainment, Movies, News, Sports, Kids, Documentary, and Pinoy
  const categories = ['Favorites', 'Entertainment', 'Movies', 'News', 'Sports', 'Kids', 'Documentary', 'Outdoors', 'Reality', 'Music', 'Spirituality', 'Pinoy', 'Offline'];

  const getCategoryCount = (cat) => {
    if (cat === 'Favorites') return favorites.length;
    if (cat === 'Offline') return offlineChannels.length;
    return channels.filter(c => (c.category || 'Entertainment') === cat && !offlineChannels.includes(c.id)).length;
  };

  // Count live and offline
  const liveCount = channels.length - offlineChannels.length;
  const offlineCount = offlineChannels.length;

  const handleChannelClick = (channel) => {
    const channelIndex = filteredChannels.findIndex(c => c.id === channel.id);
    navigate(`/iptv/watch/${channel.id}`, {
      state: { channel, channels: filteredChannels, channelIndex },
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

  // Drag to scroll logic for Top 10 list
  const gridRef = useRef(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Custom Dropdown Logic
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Momentum state
  const velX = useRef(0);
  const animationFrameId = useRef(null);
  const lastMouseMoveTime = useRef(0);

  const cancelMomentum = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  };

  const momentumLoop = () => {
    if (!gridRef.current) return;

    // Apply velocity
    gridRef.current.scrollLeft -= velX.current;

    // Decay velocity
    velX.current *= 0.95; // Friction factor

    if (Math.abs(velX.current) > 0.5) {
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    } else {
      animationFrameId.current = null;
    }
  };

  const handleMouseDown = (e) => {
    setIsDown(true);
    setIsDragging(false);
    cancelMomentum();

    setStartX(e.pageX - gridRef.current.offsetLeft);
    setScrollLeft(gridRef.current.scrollLeft);
    velX.current = 0;

    gridRef.current.style.cursor = 'grabbing';
  };

  const handleMouseLeave = () => {
    setIsDown(false);
    if (gridRef.current) gridRef.current.style.cursor = 'grab';
    // Start momentum if velocity is present
    if (Math.abs(velX.current) > 1) {
      cancelMomentum();
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    }
  };

  const handleMouseUp = () => {
    setIsDown(false);
    if (gridRef.current) gridRef.current.style.cursor = 'grab';
    setTimeout(() => setIsDragging(false), 0);

    // Start momentum if velocity is present
    if (Math.abs(velX.current) > 1) {
      cancelMomentum();
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDown) return;
    e.preventDefault();

    const x = e.pageX - gridRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll-fast factor
    const prevScrollLeft = gridRef.current.scrollLeft;

    // Calculate velocity
    const now = Date.now();
    lastMouseMoveTime.current = now;

    velX.current = (e.movementX) * 2;

    gridRef.current.scrollLeft = scrollLeft - walk;

    if (Math.abs(x - startX) > 5) {
      setIsDragging(true);
    }
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

      {/* Top 10 Live TV Channels */}
      <section className="iptv-top10-section">
        <div className="iptv-top10-header">Recommended Channels</div>
        <div
          className="iptv-top10-list"
          ref={gridRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          {[
            { rank: 1, name: 'Kapamilya Channel', logo: 'https://static.wikia.nocookie.net/abscbn/images/7/74/Kapamilya_Channel_3D_Logo.png', channelId: 1 },
            { rank: 2, name: 'GMA7', logo: 'https://static.wikia.nocookie.net/logopedia/images/a/aa/GMA_Network_2024_logo.png', channelId: 'gma7' },
            { rank: 3, name: 'TV5', logo: 'https://static.wikia.nocookie.net/tv5network/images/9/95/TV5_HD_2024.svg', channelId: 9 },
            { rank: 4, name: 'One Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/One_Sports_logo.svg/1200px-One_Sports_logo.svg.png', channelId: 39 },
            { rank: 5, name: 'Cinema One', logo: 'https://upload.wikimedia.org/wikipedia/en/6/6d/Cinema_One_2013_logo.svg', channelId: 'cinema-one' },
            { rank: 6, name: 'HBO', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg', channelId: 30 },
            { rank: 7, name: 'Cinemax', logo: 'https://logodix.com/logo/2138572.png', channelId: 36 },
            { rank: 8, name: 'CNN International', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/CNN.svg', channelId: 57 },
            { rank: 9, name: 'AMC+', logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png', channelId: 'amc-plus' },
            { rank: 10, name: 'Nickelodeon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/1280px-Nickelodeon_2009_logo.svg.png', channelId: 52 },
            { rank: 11, name: 'Animal Planet HD (IN)', logo: 'https://wildaid.org/wp-content/uploads/2021/08/animal-planet-logo-white.png', channelId: 'animal-planet-hd-in' },
            { rank: 12, name: 'Warner TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Warner2018LA.png', channelId: 'warner-tv' },
          ].map(item => {
            const channel = channels.find(c => c.id === item.channelId);
            return (
              <div
                key={item.rank}
                className="iptv-top10-item"
                onClick={() => !isDragging && channel && handleChannelClick(channel)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && channel && handleChannelClick(channel)}
                role="button"
                tabIndex={0}
                aria-label={`Rank ${item.rank}: ${item.name}`}
                style={{ cursor: channel ? 'pointer' : 'default' }}
              >
                <span className="iptv-top10-rank">{item.rank}</span>
                <div className="iptv-top10-logo-container">
                  <img src={item.logo} alt={item.name} className="iptv-top10-logo" loading="lazy" draggable="false" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

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

        {/* Custom Dropdown */}
        <div className="iptv-custom-select-container" ref={dropdownRef}>
          <div
            className={`iptv-custom-select-trigger ${isDropdownOpen ? 'open' : ''}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsDropdownOpen(!isDropdownOpen)}
          >
            <span>
              {categoryFilter === 'All'
                ? `All (${channels.length})`
                : `${categoryFilter} (${getCategoryCount(categoryFilter)})`}
            </span>
            <svg
              className={`iptv-select-arrow ${isDropdownOpen ? 'open' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          {isDropdownOpen && (
            <div className="iptv-custom-options">
              <div
                className={`iptv-custom-option ${categoryFilter === 'All' ? 'selected' : ''}`}
                onClick={() => {
                  setCategoryFilter('All');
                  setIsDropdownOpen(false);
                }}
              >
                All ({channels.length})
                {categoryFilter === 'All' && <span className="check-mark">✓</span>}
              </div>
              {categories.map(cat => (
                <div
                  key={cat}
                  className={`iptv-custom-option ${categoryFilter === cat ? 'selected' : ''}`}
                  onClick={() => {
                    setCategoryFilter(cat);
                    setIsDropdownOpen(false);
                  }}
                >
                  {cat} ({getCategoryCount(cat)})
                  {categoryFilter === cat && <span className="check-mark">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
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
