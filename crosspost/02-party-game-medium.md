# Medium: RobOS Party Game

Title: I built a party game where the AI host writes the whole night about your friends

Subtitle: The first game for RobOS game night, and why the AI has to work ahead of the room

Tags: Artificial Intelligence, Gaming, Game Development, Open Source, Generative AI

---

Most party games come with a box of cards someone wrote years ago for strangers. They're fine. But the best moments at a party are the inside jokes, and no card deck knows that your friend has strong opinions about Fleetwood Mac or that there's a drum kit in the basement.

So the first game I made for RobOS game night does the opposite. The questions come from the people in the room.

## How a night goes

You put the game on the TV. Everyone scans a QR code and fills out a short survey on their phone: some basics, their interests, a couple of confessions, a few wild cards. One person taps "I'm the party host" and describes the house. Which rooms you can use, what's in them, what's off-limits. Guitar amps in the basement, a hot tub, a cat named Pancake. That kind of thing.

Then the AI host goes to work. It's a hooded, masked character on the TV, and it talks. It reads every survey and the house description and writes the night: a secret role for each guest and the reason they got it, superlatives about this particular group, trivia about what people said they're into, bluffs, and challenges that use the actual rooms you're standing in.

[image: lobby.jpg]

In one test run it sent Maya to the basement drum kit and Priya to the karaoke mic to perform a rock anthem about sourdough. Everyone else judged from their phones. Nobody wrote that challenge until about thirty seconds before the party started.

## The games

There are five mini games right now: Who Said That?, Most Likely To, House Quest, Nerd Alert Trivia, and Two Truths & a Bot. Each one is a small file built on the same template, so adding a sixth isn't a big job.

Everyone also gets a secret role with a perk. The Detective gets one wrong answer crossed out. The Wildcard can double down. The Trickster scores a point every time they fool someone. And one guest might be the Mole, with a secret mission nobody finds out about until the finale. That's when the host unmasks them and hands out a written award to every guest, including one thanking whoever hosted.

[image: finale.jpg]

## The hard part was making the AI not slow

Agent CLIs take a while to answer. In my runs each call took somewhere between 16 and 33 seconds. That's forever when eight people are staring at a TV waiting for the next question.

The fix was to never ask the AI for something at the moment you need it. When a guest finishes their survey, a call goes out for their welcome. When the house is described, another one writes the house tour. Once everyone's ready, three calls run at the same time: the show script, the trivia, and the house quests. Standings recaps get written while the previous round is still playing. By the time the host presses Start, everything is already done.

If a call fails or comes back late, the host falls back to stock material. Nobody's party should depend on an API being in a good mood.

## Getting it onto a Roku

LG, Samsung and Android TVs just load the game's web page. My living room TV is a Roku, though, and a Roku has no browser. So for the Roku, the game draws each screen in a hidden window and pushes it to the TV as JPEG frames, through a small channel I'd already built for RobOS.

Sound was more annoying. A Roku only has one media pipeline, and I was already using it to play a silent video that keeps the TV from going to sleep. Every time the host spoke, my keep-alive check noticed the video had stopped and restarted it, which cut the host off mid-sentence. Now the keep-alive steps aside while the host talks and comes back after.

## What RobOS is

RobOS is an open-source suite of desktop apps I've been building, everything from a movie player to a point of sale system to a handful of games. In most of them AI is an optional extra. This is the one where it's required, because the AI host is the game.

The party game is the first of what I'm calling RobOS game night. More are on the way.

If you want to try it or just read the code: https://rowbose.com/games/party-game/

Source on GitHub: https://github.com/nddipiazza/robos

If you run a party with it, I'd really like to hear what the AI came up with for your group.
