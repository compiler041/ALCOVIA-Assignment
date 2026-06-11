# My Architectural Decisions

hey team so yeah i just wanted to write down how i actually built this and the decisions i made along the way for the offline sync it was definitely a bit challenging but i learned a lot

## 1 How I handled Offline Sync Event Sourcing
at first i thought i would just update the database normally but then i realized what if the user is offline so instead i went with an event sourcing approach basically every time the user does something i just log an event

why did i do this
if they are offline i can just save these events locally in the browser
when the internet comes back it just pushes all those stored events up to the server so no data gets lost
it makes syncing way easier because the server and client just trade the events they havent seen yet

## 2 Solving the Conflict Problem HLCs
so yeah students have phones and laptops what if they change a task offline on both devices we need a way to figure out which change should win

the problem at first i was just going to use the normal time but if someones laptop clock is wrong the old data would randomly overwrite the new data
my fix i read up on this and implemented a hybrid logical clock hlc
it basically tags every event with a special timestamp
this ensures we always have a perfect ordering of events even if their computer clock is messing up
for the syllabus i used a last writer wins approach based on this hlc so whenever both devices come back online they always perfectly match up

## 3 Rewards and Coins
instead of keeping a normal coins number in the database i calculate the rewards dynamically on the fly

why because if a sync fails halfway and retries adding coins twice would double count them
by just keeping a list of all the focus events the server can just count them up if the client accidentally sends the same focus event twice the server knows the id already exists and ignores it the total coins are always correct

## 4 The WhatsApp Webhook n8n
for sending the whatsapp message via n8n i had to make sure the student doesnt get spammed twice for the exact same focus session

how i solved it i made a simple notifications_sent table when the sync comes in the backend checks this table if it successfully adds the session id it fires the webhook if it fails it just skips it exactly once delivery

## 5 The Mock WhatsApp Server
just to make it super easy for you guys to test this without needing to set up a whole n8n account i actually built a mock whatsapp endpoint right into the express backend

it perfectly acts like n8n and logs the fake whatsapp message to the console but the code is totally ready for the real thing you just swap out the webhook url

thanks again for the opportunity really hope you guys like the code
