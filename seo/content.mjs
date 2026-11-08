// Content for skriin.com's static, crawlable pages. scripts/build-seo.mjs turns
// this into HTML files next to the Angular build, plus sitemap.xml and 404.html.
//
// Keep claims to what the product actually does. Prices change, so link to the
// store for them instead of writing them here.

export const SITE = {
  origin: 'https://skriin.com',
  name: 'skriin ai tv',
  store: 'https://skriin.tv/',
  email: 'him@skriin.com',
  phone: '+1 (650) 509-7773',
  ogImage: 'https://skriin.com/assets/MainLogo.png',
};

const UPDATED = '2026-11-08';

/** Hub pages. */
export const HUBS = [
  {
    slug: 'features',
    updated: UPDATED,
    title: 'How skriin works: the two-way TV box | skriin ai tv',
    description:
      'skriin is a small box with a camera and a controller that turns any HDMI TV into a two-way TV. Watch, go live, podcast and talk to your TV from the couch.',
    h1: 'How skriin works',
    lede:
      'skriin is a small box that turns the TV you already own into a two-way TV. It adds four buttons to your TV, podcast, live, watch and yap, and everything runs from the controller in your hand. No keyboard, no laptop, no settings to fight.',
    sections: [
      {
        h2: 'Four buttons on your TV',
        body: `
<ul>
  <li><strong>Watch.</strong> Lean back with live shows, streams and video podcasts from real people. Watching is free, on your TV, your phone or <a href="/">skriin.com</a> in any browser. <a href="/guides/watch-live-streams-on-your-tv">More on watching</a>.</li>
  <li><strong>Live.</strong> Pick Live, press A and you're on. Your stream can go to skriin, YouTube, Twitch and Kick at the same time. <a href="/guides/go-live-from-your-tv">How to go live from your TV</a>.</li>
  <li><strong>Podcast.</strong> The camera is already on your TV. Sit down, hit record and make a video podcast from your couch. <a href="/guides/video-podcast-without-a-computer">How to record a video podcast without a computer</a>.</li>
  <li><strong>Yap.</strong> Press Start and talk. Ask it anything out loud, and your TV talks back. <a href="/guides/talk-to-your-tv">More on talking to your TV</a>.</li>
</ul>`,
      },
      {
        h2: 'Set up in three steps',
        body: `
<ol>
  <li><strong>Plug it in.</strong> HDMI into your TV, power into the wall. The camera clips onto the top of the TV.</li>
  <li><strong>Join Wi-Fi from your phone.</strong> Show your phone's Wi-Fi code to the camera, or scan the code on screen. No typing with a remote.</li>
  <li><strong>Press A.</strong> Choose Live and press A on the controller. That's the whole studio.</li>
</ol>
<p>It works with any TV that has an HDMI port, smart TV or not, because skriin brings its own home screen. You need a power outlet near the TV and Wi-Fi or an Ethernet cable.</p>`,
      },
      {
        h2: "What's in the box",
        body: `
<ul>
  <li>The skriin ai tv box</li>
  <li>The camera, with a privacy shutter, that clips onto your TV</li>
  <li>The controller and its USB receiver</li>
  <li>A short remote with batteries</li>
  <li>An HDMI cable and a power adapter</li>
</ul>
<p>A capture card version adds two HDMI inputs (up to 4K at 60 fps) so you can stream a console, a laptop or an HDMI camera. See <a href="/guides/stream-console-games-without-a-pc">streaming console games</a> and <a href="/guides/live-stream-with-a-mirrorless-camera">using your own camera</a>.</p>`,
      },
      {
        h2: 'Start free on your phone',
        body: `<p>No box yet? Watch at <a href="/">skriin.com</a> in any browser, or get the free skriin ai tv app on your iPhone and go live tonight. When you add the box later, it's the same account and the same channel. <a href="/guides/go-live-from-your-iphone">How to go live from your iPhone</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Will skriin work with my TV?', a: "Yes, if it has an HDMI port. It doesn't matter whether it's a smart TV, because skriin brings its own home screen." },
      { q: 'Is there a monthly fee?', a: 'No. Watching and going live on skriin is free, and the iPhone app is free to download. You pay once for the box.' },
      { q: 'What happens to my live stream when it ends?', a: "It's saved to your channel as a video, so people can watch it on demand any time, on their TV or their phone." },
      { q: 'Can I try skriin before I buy?', a: 'Yes. Watch at skriin.com in any browser, or go live from your phone with the free iPhone app.' },
    ],
  },
];

/** Intent pages: one problem people search for, answered. */
export const GUIDES = [
  {
    slug: 'go-live-from-your-tv',
    updated: UPDATED,
    title: 'How to go live from your TV (no PC needed) | skriin ai tv',
    description:
      'Go live from your living room with one button: a camera on your TV, a controller in your hand and no streaming PC, capture software or encoder settings.',
    h1: 'How to go live from your TV',
    lede:
      "Most livestreaming setups assume a desk: a computer, streaming software, a webcam and a pile of settings. If what you want is to sit on your couch and be on air, the TV is a better studio. It's already the biggest screen in the room, it faces the couch, and with a camera on top it can show you and your viewers' chat at the same time.",
    sections: [
      {
        h2: 'What you need',
        body: `
<ul>
  <li>A TV with an HDMI port (smart or not)</li>
  <li>Wi-Fi or an Ethernet cable near the TV</li>
  <li>A skriin ai tv box, which comes with the camera and the controller</li>
</ul>
<p>There is no streaming PC to buy, no capture software to install and no bitrate or encoder settings to learn.</p>`,
      },
      {
        h2: 'Go live in three steps',
        steps: [
          'Plug the box into your TV with HDMI and into the wall for power. Clip the camera onto the top of the TV.',
          "Join Wi-Fi from your phone: show your phone's Wi-Fi code to the camera, or scan the code on the TV screen.",
          'On the controller, choose Live and press A. You are on air.',
        ],
      },
      {
        h2: 'Choose what your viewers see',
        body: `<p>Before or during the stream you can switch the video source between <strong>Camera</strong>, <strong>Screen</strong> and <strong>Screen + cam</strong>, and swap which one is the main picture. Mic and screen audio each have their own control. Chat shows up on the TV, so you can read and answer viewers without picking up your phone.</p>`,
      },
      {
        h2: 'Reach viewers on other platforms too',
        body: `<p>Your stream goes to your skriin channel, and you can send it to YouTube, Twitch and Kick at the same time. Connect those channels once from your phone, and each one has its own on/off toggle on the Live screen. <a href="/guides/simulcast-to-youtube-twitch-and-kick">How simulcasting works</a>.</p>`,
      },
      {
        h2: 'After the stream',
        body: `<p>When you end the stream, it's saved to your channel as a video, so anyone who missed it can watch it on demand on their TV, their phone or <a href="/">skriin.com</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Do I need a computer to livestream from my TV?', a: 'Not with skriin. The box, the camera and the controller handle the whole stream, so there is no PC or streaming software involved.' },
      { q: 'Can I try it before buying the box?', a: 'Yes. The free skriin ai tv iPhone app goes live from your phone on the same account and channel you would later use on your TV.' },
      { q: 'Does it work with an older TV that is not a smart TV?', a: 'Yes, as long as it has an HDMI port. skriin brings its own home screen.' },
    ],
    related: ['simulcast-to-youtube-twitch-and-kick', 'go-live-from-your-iphone', 'livestream-a-yoga-class-from-home'],
  },
  {
    slug: 'simulcast-to-youtube-twitch-and-kick',
    updated: UPDATED,
    title: 'Stream to YouTube, Twitch and Kick at the same time | skriin',
    description:
      'Simulcast one live stream to YouTube, Twitch, Kick and skriin at once from your TV. Connect your channels once, then one press sends your stream to all of them.',
    h1: 'Stream to YouTube, Twitch and Kick at the same time',
    lede:
      "Simulcasting, or multistreaming, means sending one live stream to several platforms at once. Your audience is split across YouTube, Twitch and Kick, and asking them all to move to one place rarely works. Simulcasting lets you meet each group where it already watches, without running a separate stream for each.",
    sections: [
      {
        h2: 'The usual way, and why it is hard',
        body: `<p>On a computer, simulcasting usually means streaming software plus either a paid relay service or enough upload bandwidth and CPU to encode several streams. Each platform needs its own stream key and settings, and something always needs updating.</p>`,
      },
      {
        h2: 'Simulcasting with skriin',
        steps: [
          'From your phone, connect your YouTube, Twitch and Kick channels to your skriin account. You only do this once.',
          'On your TV, open Live. Each connected platform has its own toggle, so you choose where this stream goes.',
          'Press A to go live. One stream goes out to skriin and every platform you turned on, with no capture software and no encoder settings.',
        ],
      },
      {
        h2: 'See which destinations are live',
        body: `<p>Each platform toggle on the Live screen shows its state, so you can tell at a glance whether a destination is on, live, unavailable or has an error, and turn one on or off without stopping the others.</p>`,
      },
      {
        h2: 'Your skriin channel keeps the replay',
        body: `<p>When the stream ends it's saved to your skriin channel as a video, so viewers can watch it on demand on their TV, their phone or <a href="/">skriin.com</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Which platforms can I simulcast to?', a: 'skriin, YouTube, Twitch and Kick, at the same time.' },
      { q: 'Do I need restreaming software or a relay service?', a: 'No. You connect your channels once from your phone, and skriin sends the stream to each platform you turn on.' },
      { q: 'Can I simulcast from my phone?', a: 'Yes. The free skriin ai tv iPhone app can go live and restream too, on the same account you use on your TV.' },
    ],
    related: ['go-live-from-your-tv', 'stream-console-games-without-a-pc', 'go-live-from-your-iphone'],
  },
  {
    slug: 'video-podcast-without-a-computer',
    updated: UPDATED,
    title: 'How to record a video podcast without a computer | skriin',
    description:
      'Make a video podcast from your couch: the camera is already on your TV. Invite people, hit record and go live while you record, with no computer or editing software.',
    h1: 'How to record a video podcast without a computer',
    lede:
      "Video podcasts are where podcasting is growing, but the usual setup is a desk full of gear: cameras, an audio interface, a computer running recording software and hours of editing afterward. If your show is a conversation, your living room already has the right furniture. What it's missing is a camera that's always set up.",
    sections: [
      {
        h2: 'Why record a podcast on your TV',
        body: `
<ul>
  <li><strong>The camera is already there.</strong> It clips onto the top of the TV and points at the couch, so the shot is set up before you sit down.</li>
  <li><strong>Everyone can see the screen.</strong> Hosts and guests watch the recording on the TV, not hunched over a laptop.</li>
  <li><strong>One controller runs it.</strong> Record, invite people and go live from the controller in your hand.</li>
</ul>`,
      },
      {
        h2: 'Record an episode',
        steps: [
          'On your TV, open Podcast.',
          'Open People to invite the guests you want on the episode.',
          'Press Record. The timer on screen shows how long you have been rolling.',
          'Optionally, press Go live while recording to stream the episode as it happens.',
          'Stop recording when you are done. The episode is saved to your channel.',
        ],
      },
      {
        h2: 'Tips for better audio and video',
        body: `
<ul>
  <li>Sit within a few feet of the TV and face it, so the camera and its mics catch everyone.</li>
  <li>Turn off loud appliances and close windows. Soft furnishings like a rug and curtains reduce echo.</li>
  <li>Put a lamp in front of you, not behind you. A bright window behind the couch turns everyone into a silhouette.</li>
  <li>Do a 30 second test recording and watch it back before a long episode.</li>
</ul>`,
      },
      {
        h2: 'Publish it',
        body: `<p>Episodes live on your skriin channel, where people can watch on their TV, their phone or <a href="/">skriin.com</a>. If you go live while recording, the stream can also go out to YouTube, Twitch and Kick. <a href="/guides/simulcast-to-youtube-twitch-and-kick">How simulcasting works</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Can I make a video podcast without a computer?', a: 'Yes. With skriin, the camera on your TV records the episode and the controller runs everything, so no computer or recording software is needed.' },
      { q: 'Can I record and livestream at the same time?', a: 'Yes. Start recording, then press Go live to stream the episode while it records.' },
      { q: 'Where do my episodes go?', a: 'To your skriin channel, where people can watch them on demand on a TV, a phone or in any browser.' },
    ],
    related: ['go-live-from-your-tv', 'teach-a-class-live-from-your-living-room', 'simulcast-to-youtube-twitch-and-kick'],
  },
  {
    slug: 'livestream-a-yoga-class-from-home',
    updated: UPDATED,
    title: 'How to livestream a yoga or fitness class from home | skriin',
    description:
      'Teach a live yoga or fitness class from your living room: the camera sits on your TV so the whole mat is in frame, and you see your class on the big screen.',
    h1: 'How to livestream a yoga or fitness class from home',
    lede:
      "Streaming a class from a laptop or phone has the same problems every time: the device is too close to fit your whole body in, the screen is too small to see from the mat, and something falls over mid-class. A TV is already across the room at the right distance, and it's big enough to read from a downward dog.",
    sections: [
      {
        h2: 'Set up your space',
        body: `
<ul>
  <li><strong>Distance.</strong> Put your mat far enough from the TV that your whole body fits in frame standing and lying down. Check it on screen before you start.</li>
  <li><strong>Orientation.</strong> Lay the mat side-on to the TV for most flows, so students see your full profile in standing poses.</li>
  <li><strong>Light.</strong> Light your face and body from the front or the side. Avoid a bright window behind you.</li>
  <li><strong>Sound.</strong> Speak toward the TV, and keep music low enough that your cues come through clearly.</li>
</ul>`,
      },
      {
        h2: 'Go live',
        steps: [
          'Clip the skriin camera onto the top of the TV and roll out your mat.',
          'Open Live and choose Camera as the video source.',
          'Turn on the platforms your students use. Your class can go to skriin, YouTube, Twitch and Kick at the same time.',
          'Press A on the controller to go live, then set the controller down and teach.',
        ],
      },
      {
        h2: 'See and talk to your class',
        body: `<p>Chat shows up on the TV, big enough to read from the mat, so you can answer questions and give shout-outs between poses without walking over to a phone.</p>`,
      },
      {
        h2: 'Offer the replay',
        body: `<p>Every class is saved to your skriin channel when you end the stream, so students in other time zones can take it on demand on their TV, their phone or <a href="/">skriin.com</a>.</p>`,
      },
    ],
    faq: [
      { q: 'What is the best way to livestream a yoga class from home?', a: "Use a camera far enough away to fit your whole mat, and a screen big enough to read chat from the floor. A camera on your TV does both, since the TV is already across the room." },
      { q: 'Can my students watch on a TV?', a: 'Yes. They can watch on skriin from a TV, a phone or any browser, or on YouTube, Twitch or Kick if you simulcast there.' },
      { q: 'Are classes saved?', a: 'Yes. Each live class is saved to your channel as a video your students can watch later.' },
    ],
    related: ['teach-a-class-live-from-your-living-room', 'go-live-from-your-tv', 'simulcast-to-youtube-twitch-and-kick'],
  },
  {
    slug: 'teach-a-class-live-from-your-living-room',
    updated: UPDATED,
    title: 'How to teach an online class live from your living room | skriin',
    description:
      'Teach lessons, workshops and tutorials live from your couch: show yourself, your screen or both, read questions on your TV and keep every class as a replay.',
    h1: 'How to teach an online class live from your living room',
    lede:
      "Music lessons, cooking demos, language practice, craft workshops, tutoring: a lot of teaching happens better from a comfortable room than a desk. The trick is a setup that shows you clearly, shows your material when you need it and lets you see your students' questions without breaking the flow.",
    sections: [
      {
        h2: 'Show you, your screen or both',
        body: `<p>skriin has three video sources: <strong>Camera</strong> for you, <strong>Screen</strong> for your material and <strong>Screen + cam</strong> to show both at once. You can swap which one is the main picture mid-class. With the capture card version, plug in a laptop over HDMI to share slides, a document or a design.</p>`,
      },
      {
        h2: 'Run a live class',
        steps: [
          'Clip the camera onto the TV and sit where you want to teach.',
          'Open Live and pick the video source for the start of class.',
          'Choose where to stream: your skriin channel, plus YouTube, Twitch or Kick if your students are there.',
          'Press A to go live. Switch sources with the controller as the lesson moves along.',
        ],
      },
      {
        h2: 'Answer questions as they come in',
        body: `<p>Chat appears on the TV, so you can read questions from across the room and answer them on camera. Everyone watching gets the answer, not just the person who asked.</p>`,
      },
      {
        h2: 'Build a library of lessons',
        body: `<p>Each class is saved to your channel when the stream ends. Over time that becomes a library students can browse and replay on their TV, their phone or <a href="/">skriin.com</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Can I share my laptop screen while I teach?', a: 'Yes, with the capture card version of the skriin box. Plug the laptop in over HDMI and choose Screen, or Screen + cam to show yourself too.' },
      { q: 'Do my students need a skriin box?', a: 'No. They can watch for free in any browser at skriin.com, on a phone, or on YouTube, Twitch or Kick if you simulcast there.' },
    ],
    related: ['livestream-a-yoga-class-from-home', 'video-podcast-without-a-computer', 'live-stream-with-a-mirrorless-camera'],
  },
  {
    slug: 'stream-console-games-without-a-pc',
    updated: UPDATED,
    title: 'How to stream console games without a PC | skriin ai tv',
    description:
      'Stream your PlayStation, Xbox or Switch gameplay with your face on camera to Twitch, YouTube and Kick at once. Built-in capture card, no streaming PC.',
    h1: 'How to stream console games without a PC',
    lede:
      "Streaming console games usually means a capture card, a PC to run streaming software and a webcam you have to keep in sync with the game audio. If you just want to play on your TV and have your stream look good, that's a lot of hardware sitting between you and the go-live button.",
    sections: [
      {
        h2: 'What you need',
        body: `
<ul>
  <li>The capture card version of the skriin ai tv box, which has two HDMI inputs (up to 4K at 60 fps)</li>
  <li>Your console: anything with HDMI out</li>
  <li>A TV with HDMI</li>
</ul>
<p>The camera and the controller are in the box. The capture card is built in, so there's nothing separate to buy or set up.</p>`,
      },
      {
        h2: 'Set up and go live',
        steps: [
          "Plug your console's HDMI into one of the box's HDMI inputs, and the box into your TV.",
          'Clip the skriin camera onto the top of the TV so it sees you on the couch.',
          'Open Live and choose Screen + cam to put your game and your face in one stream. Swap which is the main picture any time.',
          'Turn on Twitch, YouTube and Kick, then press A to go live on all of them and skriin at once.',
        ],
      },
      {
        h2: 'Audio that stays in sync',
        body: `<p>Because the capture card is built into the same box as the camera, your voice stays matched to the picture. There's no audio drift to fix in software. Mic and game audio each have their own level control.</p>`,
      },
      {
        h2: 'Other things you can plug in',
        body: `<p>The same HDMI inputs take a laptop for tutorials or slides, or a mirrorless camera or camcorder. <a href="/guides/live-stream-with-a-mirrorless-camera">How to stream with your own camera</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Can I stream console games without a PC?', a: 'Yes. The capture card version of skriin takes your console over HDMI and streams it with your camera, with no PC or streaming software.' },
      { q: 'Can I show my face and my game at the same time?', a: 'Yes. Choose Screen + cam to put the game and your camera in one stream.' },
      { q: 'Does the standard box stream consoles?', a: 'No. The standard box goes live with the camera in the box. Streaming a console needs the capture card version.' },
    ],
    related: ['simulcast-to-youtube-twitch-and-kick', 'live-stream-with-a-mirrorless-camera', 'go-live-from-your-tv'],
  },
  {
    slug: 'live-stream-with-a-mirrorless-camera',
    updated: UPDATED,
    title: 'Live stream with a mirrorless camera or camcorder, no PC | skriin',
    description:
      'Use your mirrorless camera or camcorder for live streaming over HDMI, with no computer or separate capture card. Simulcast to YouTube, Twitch and Kick.',
    h1: 'How to live stream with a mirrorless camera, without a computer',
    lede:
      "A mirrorless camera or camcorder makes a stream look far better than a webcam: better sensor, real lenses, background blur. Getting its picture into a stream usually takes a capture dongle, a computer and streaming software. With a box that has HDMI inputs and does the streaming itself, the camera plugs straight in.",
    sections: [
      {
        h2: 'Check your camera',
        body: `
<ul>
  <li><strong>Clean HDMI output.</strong> In the camera's settings, turn off on-screen info on HDMI output so icons and focus boxes don't appear in your stream.</li>
  <li><strong>Power.</strong> Long streams drain batteries. Use a dummy battery or USB power if your camera supports it.</li>
  <li><strong>Overheating and auto-off.</strong> Disable auto power-off, and check how long your camera can output video continuously.</li>
</ul>`,
      },
      {
        h2: 'Connect and go live',
        steps: [
          "Connect your camera's HDMI output to one of the HDMI inputs on the capture card version of the skriin box.",
          'Open Live and choose Screen to use the camera as your picture. Choose Screen + cam to add the skriin camera as a second angle.',
          'Turn on the platforms you want: skriin, YouTube, Twitch and Kick.',
          'Press A to go live.',
        ],
      },
      {
        h2: 'Why it stays in sync',
        body: `<p>The capture card is built into the box, so there's no separate dongle and no audio drift to correct. Your voice stays matched to the picture.</p>`,
      },
    ],
    faq: [
      { q: 'Can I use my mirrorless camera as a webcam without a computer?', a: 'Yes. Plug it into the HDMI input on the capture card version of skriin, and skriin streams it directly.' },
      { q: 'Do I need a separate capture card?', a: 'No. The capture card version of skriin has two HDMI inputs built in.' },
    ],
    related: ['stream-console-games-without-a-pc', 'teach-a-class-live-from-your-living-room', 'simulcast-to-youtube-twitch-and-kick'],
  },
  {
    slug: 'go-live-from-your-iphone',
    updated: UPDATED,
    title: 'How to go live from your iPhone for free | skriin ai tv',
    description:
      "Go live from your iPhone with the free skriin ai tv app: stream with your phone's camera and mic, simulcast to YouTube, Twitch and Kick, and move to your TV later.",
    h1: 'How to go live from your iPhone',
    lede:
      "You don't need any gear to start a live channel. Your iPhone already has a good camera and microphone, and the free skriin ai tv app turns it into a live studio that can reach skriin, YouTube, Twitch and Kick at the same time.",
    sections: [
      {
        h2: 'Go live in a minute',
        steps: [
          'Get the free skriin ai tv app on your iPhone and sign in.',
          'Optionally, connect your YouTube, Twitch and Kick channels so you can simulcast.',
          "Tap Go live. You're streaming with your phone's camera and mic.",
        ],
      },
      {
        h2: 'Tips for phone streams',
        body: `
<ul>
  <li>Use a stand or tripod. A steady phone looks far more professional than a handheld one.</li>
  <li>Face a window or a lamp so the light falls on you.</li>
  <li>Plug in for long streams, and turn on Do Not Disturb so calls don't interrupt.</li>
</ul>`,
      },
      {
        h2: 'Move to the big screen when you are ready',
        body: `<p>When you want the couch in the shot, a real camera and your chat on a big screen, add the skriin box. It's the same account and the same channel, so your viewers and your replays come with you. <a href="/guides/go-live-from-your-tv">How to go live from your TV</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Is the skriin iPhone app free?', a: 'Yes. The app is free to download, and watching and going live on skriin is free.' },
      { q: 'Do I need the skriin box to go live?', a: 'No. You can go live from your iPhone without the box, and add the box later on the same account.' },
    ],
    related: ['go-live-from-your-tv', 'simulcast-to-youtube-twitch-and-kick', 'watch-live-streams-on-your-tv'],
  },
  {
    slug: 'talk-to-your-tv',
    updated: UPDATED,
    title: 'Talk to your TV out loud and it talks back | skriin ai tv',
    description:
      'Yap is the voice AI on skriin ai tv. Press Start and ask anything out loud, and your TV answers back. No typing, no remote menus.',
    h1: 'Talk to your TV, and it talks back',
    lede:
      "Typing on a TV with a remote is miserable, and voice remotes mostly just search. Yap is different: it's a conversation. Press Start, ask anything out loud, and your TV answers in its own voice.",
    sections: [
      {
        h2: 'How Yap works',
        steps: [
          'Choose yap on the skriin home screen.',
          'Press Start.',
          "Talk normally. Ask a question, think out loud or keep the conversation going, and your TV talks back.",
        ],
      },
      {
        h2: 'Things to ask',
        body: `
<ul>
  <li>A question the whole room is arguing about</li>
  <li>An explanation of something you just watched</li>
  <li>Ideas for your next stream or podcast episode</li>
  <li>Anything you would otherwise type into a search box</li>
</ul>`,
      },
      {
        h2: 'Part of a two-way TV',
        body: `<p>Yap sits next to watch, live and podcast on the skriin home screen, all run from one controller. <a href="/features">How skriin works</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Can I talk to my TV and have it answer?', a: 'Yes. With skriin, open yap, press Start and talk. Your TV answers out loud.' },
      { q: 'Do I need a keyboard or my phone?', a: 'No. Yap runs on voice, and the rest of skriin runs from the controller.' },
    ],
    related: ['watch-live-streams-on-your-tv', 'go-live-from-your-tv', 'video-podcast-without-a-computer'],
  },
  {
    slug: 'watch-live-streams-on-your-tv',
    updated: UPDATED,
    title: 'Watch live streams and video podcasts on your TV, free | skriin',
    description:
      'Watch live shows, streams and video podcasts from real people on your TV, phone or any browser. Free to watch on skriin, with replays of every stream.',
    h1: 'Watch live streams and video podcasts on your TV',
    lede:
      "Live streams and video podcasts are made by real people, often from their own living rooms. They're best watched the same way: from the couch, on the big screen. skriin's watch feed brings live shows, streams and video podcasts together, free.",
    sections: [
      {
        h2: 'Where you can watch',
        body: `
<ul>
  <li><strong>In any browser.</strong> Open <a href="/">skriin.com</a>. No account needed to start watching.</li>
  <li><strong>On your phone.</strong> With the free skriin ai tv iPhone app.</li>
  <li><strong>On your TV.</strong> With the skriin box, run from the controller.</li>
</ul>`,
      },
      {
        h2: 'Live now, or on demand',
        body: `<p>Live streams play as they happen. When a stream ends it's saved to the creator's channel, so you can watch it on demand any time.</p>`,
      },
      {
        h2: 'Want your own channel?',
        body: `<p>Everyone gets a channel. Go live from your iPhone for free, or from your TV with the skriin box. <a href="/guides/go-live-from-your-iphone">Start on your phone</a> or <a href="/guides/go-live-from-your-tv">go live from your TV</a>.</p>`,
      },
    ],
    faq: [
      { q: 'Is watching on skriin free?', a: 'Yes. Watching is free in any browser at skriin.com, on the iPhone app and on the skriin box.' },
      { q: 'Can I watch a stream after it ends?', a: "Yes. Live streams are saved to the creator's channel and can be watched on demand." },
    ],
    related: ['go-live-from-your-iphone', 'talk-to-your-tv', 'video-podcast-without-a-computer'],
  },
];

export const GUIDES_HUB = {
  slug: 'guides',
  updated: UPDATED,
  title: 'Guides: livestreaming, podcasting and more from your TV | skriin',
  description:
    'Step-by-step guides to going live from your TV, simulcasting to YouTube, Twitch and Kick, recording video podcasts, teaching classes and streaming games.',
  h1: 'Guides',
  lede:
    "Step-by-step guides for going live, podcasting and teaching from the couch, with or without a computer.",
};
