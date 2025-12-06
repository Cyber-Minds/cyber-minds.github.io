# Lesson 4: Cryptographic Attacks

**Note:** please do not try any of these attacks on a real system, only practice these on designated software

A **cryptographic attack** is a cyberattack that allows the attacker to bypass cryptographic defenses. The most common example of a cryptographic attack would be attempting to log into an account with different credentials because this is meant to get around the fact that credentials are hashed when stored and cannot be accessed in their databases. In this article, we will explore how different cryptographic attacks relate to this example.

**Note:** This process of attempting to crack or exploit cryptographic systems is called cryptanalysis. However, cryptanalysis refers more to cracking a cryptographic algorithm rather than bypassing it.

## Brute Forcing:

**Brute forcing**, like the name implies, is the process of trying every combination of credentials in order to gain access to a system, specifically finding a password to a certain username. Obviously, there are billions of combinations for an attacker to try. Computer programs are used to speed this process up, but we could all be dead before a successful combination is found. That is why there are some strategies and variations of brute forcing that are used to find a match:

- **Ordinary Brute Forcing:** trying every combination ever, not a very efficient use of time
  - **Likelihood of Success:** Guaranteed
  - **Time:** Could be 2 septillion years...

- **Rainbow Table Attack:** a rainbow table attack uses a wordlist with each credential's hash. It is likely to have less credentials to go through than a dictionary since the hashes take up more space.
  - **Likelihood of Success:** Higher the larger the dictionary is, attackers are likely to use something that makes is possible for them to succeed
  - **Time:** Longer the larger the dictionary is, attackers will use something that a computer can go through in a short to medium amount of time

- **Reverse Brute Forcing:** taking a commonly used password and trying many usernames with it. Reverse brute forcing (and other attacks not mentioned here) can be paired with wordlists or rainbow tables to expedite the brute forcing process.

- **Using Common Credentials (additional concept):** Attackers can minimize the amount of time to brute force by limiting their wordlists to only credentials that are common.

## Collision-Exploiting Attacks:

**Collision-exploiting attacks** take advantage of repeating **hashes**, or collisions. Sometimes, these can exploit errors in a poorly constructed hashing algorithm that resulted in collisions. They can also exploit repeat hashes in databases. Examples of collision-exploiting attacks are classic collision attacks and birthday attacks. A **cryptographic defense** to collision attacks is **salting**. Salting is when a random string of characters, known as a salt, is appended to the end of a credential before it is hashed. So, if two people use the same password, the added salt changes the hashes so they are not the same in storage.
