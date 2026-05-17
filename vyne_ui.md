# 🎨 Vyne — UI Documentation

## 1. UI Philosophy

Vyne should feel:
- musical
- alive
- social
- identity-driven
- clean rather than cluttered

The UI should communicate one primary idea:

> “People close to you in the interface are close to you in vibe.”

The visual system should be modern, minimal, and soft, with motion used to create life without distracting the user.

---

## 2. Visual Identity

### 2.1 Core Mood
The interface should feel:
- warm
- immersive
- soft
- premium
- slightly playful

### 2.2 Design Language
Use:
- rounded cards
- soft glow
- layered depth
- blur overlays
- floating motion
- clear typography
- strong contrast for actions

Avoid:
- sharp, harsh blocks
- noisy gradients
- cluttered data-heavy layouts
- overly technical visuals

---

## 3. Login Screen

### 3.1 Goal
The first screen should immediately communicate that the app is about music and identity.

### 3.2 Background Concept
The login screen uses a moving background made of song or album cards.

These cards:
- scroll like a slow carousel
- move subtly in the background
- are partially blurred and darkened
- create an ambient music-first feeling

### 3.3 Layout
Foreground:
- app logo / wordmark
- tagline: "Your campus, your vibe."
- primary button: Log in with ETLab (Campus Verification)
- secondary: "Music identity setup follows login"

Background:
- one or more rows of song cards
- horizontal movement
- soft blur
- dark gradient overlay

### 3.4 Motion Rules
The background carousel should:
- move slowly
- never distract from buttons
- feel continuous
- have no sharp jumps

### 3.5 Visual Priority
The call-to-action buttons must remain the dominant visual element.

---

## 4. Main Discovery Screen

### 4.1 Core UI Pattern
The discovery screen uses a bubble field.

This is the core product screen.

Each bubble represents a user match candidate.

### 4.2 Bubble Field Logic
The center of the screen contains a “YOU” anchor.

Other users are positioned around it.

Bubble rules:
- larger bubble = stronger match
- closer to center = higher similarity
- optional color = vibe category
- label = user name + match %

### 4.3 Why Bubbles
The bubble layout works because it:
- makes similarity intuitive
- feels social
- avoids boring list-based discovery
- gives the app a unique visual identity

### 4.4 Interaction
Tap bubble:
- open match preview sheet

Long press bubble:
- optional quick actions later

Pan:
- optional if field is larger than screen

For MVP:
- tap interaction is enough

---

## 5. Match Preview Sheet

When a user taps a bubble, a bottom sheet or modal appears.

### 5.1 Information Shown
- profile photo
- name
- match %
- 1–3 shared artists
- vibe similarity summary
- send request button

### 5.2 Purpose
This sheet helps the user quickly decide:
- interesting enough to connect?
- not interested?

### 5.3 Actions
Primary:
- Send Match Request

Secondary:
- Dismiss / Close

---

## 6. Request and Acceptance Flow UI

### 6.1 Sent Request State
After sending a match request:
- show “Request Sent”
- disable repeated send action
- keep card visible

### 6.2 Incoming Request Screen
A dedicated requests screen or tab should show:
- who requested to match
- preview of match %
- shared artists
- accept button
- decline button

### 6.3 Accepted State
Once both users accept:
- profile opens into full match mode
- deeper information becomes visible

---

## 7. Full Match Profile Screen

### 7.1 Purpose
This is the reward screen after mutual acceptance.

### 7.2 Key Sections
Header:
- profile photo
- name
- match %
- vibe summary headline

Content:
- shared artists
- top songs
- vibe explanation
- optional listening activity

Actions:
- send song
- view received songs
- react to songs

### 7.3 Emotional Goal
The screen should make the user feel:
> “This person really gets my taste.”

---

## 8. Song Interaction Screens

### 8.1 Send Song Flow
User taps “Send Song”.

They can:
- search for a song
- select from recommendations
- send the song to the match

### 8.2 Received Songs View
Matched users see:
- received song card
- sender
- track title
- artist
- react buttons (👍 / 👎)

### 8.3 Design Rules
Keep actions very simple.
No chat box.
No long comment flows.
Song is the message.

---

## 9. Leaderboard Screen

### 9.1 Purpose
A light validation layer, not the core screen.

### 9.2 Content Options
Can include:
- Top Vibe Matches
- Most Unique Taste
- Featured Matches

### 9.3 Layout
Use cards rather than tables.

Each leaderboard card can show:
- names
- match %
- minimal summary

### 9.4 Tone
Should feel celebratory, not competitive in a harsh way.

---

## 10. Onboarding Screens

### 10.1 First Input Screen
Prompt:
- Add your vibe

Step 1: Campus Verification
- Log in with ETLab

Step 2: Music Identity (Optional but recommended)
- Connect Spotify
- Add songs manually
- Paste playlist

### 10.2 Manual Add Flow
The song search experience should:
- be fast
- show artwork
- allow quick add
- feel lightweight

### 10.3 Progress Feedback
After enough songs are added:
- show that a vibe is being built
- then show rough matches quickly

### 10.4 Principle
Do not delay value too long.
Users should see something meaningful early.

---

## 11. Internal Test UI

The internal direct-connection test flow is not part of the public UI.

It should only exist on a private internal page for the admin user.

Requirements:
- no link in public navigation
- backend authorization required
- visually separated from production UI

---

## 12. Motion and Animation

### 12.1 General Motion
Vyne should feel gently alive.

Use motion for:
- bubble float
- carousel drift
- modal transitions
- small button feedback

Avoid:
- excessive bouncing
- distracting transitions
- fast parallax

### 12.2 Discovery Screen Motion
Bubbles can:
- float subtly
- settle into position on screen load
- slightly expand on tap

### 12.3 Login Background Motion
Song cards should:
- slide horizontally
- loop cleanly
- move slowly
- stay behind a dark overlay

---

## 13. MVP UI Scope

For the first build, include:
- login screen with ambient card carousel
- onboarding flow
- bubble discovery screen
- match preview sheet
- request acceptance screen
- full match profile screen
- send song screen
- received songs screen
- leaderboard screen

Skip initially:
- advanced zooming
- physics-heavy bubble systems
- complicated filters
- chat
- overly complex transitions

---

## 14. Frontend Notes

### Bubble Positioning
Bubble distance from center should be based on inverse similarity.

Basic idea:
- higher similarity = closer to center
- slight angular randomization avoids overlap

### Bubble Count
Limit the visible discovery set to a manageable number such as:
- top 10
- top 15
- top 20

Too many bubbles will make the screen noisy.

### Readability
Always show:
- name
- match %

Never let the visual metaphor hide essential information.

---

## 15. Final UI Summary

Vyne UI is built around:
- ambient music-first onboarding
- bubble-based discovery
- progressive reveal after acceptance
- songs as the main interaction object

The UI should always reinforce:
- music as identity
- closeness as similarity
- interaction without chat
- a soft but memorable social experience
