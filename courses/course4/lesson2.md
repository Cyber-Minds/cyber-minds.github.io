# Lesson 2: Non-Technical Measures

Defense does not only come in the form of firewalls and protective software, any measure, whether technical or not, should be taken to keep the digital world **safe**. Additionally, it is said that humans are the **weakest link** in security, this is something that software cannot fix. Measures are taken to ensure that information does not **fall** into the wrong hands or misused.

## Defense in Depth:

Defense in depth refers to using more than one layer of defense. An example of this is two-factor authentication **(TFA or 2FA)**. In addition to providing a username and password, TFA may ask you security questions to prove you are who you say you are. Since this uses more than one layer of security, it reflects the defense in depth concept. Defense in **Depth** can also refer to using more technical measures, like multiple firewalls (Course 10), intrusion detection systems (later in this course), etc.

## Avoiding Security by Obscurity:

Security by obscurity refers to using secrecy to keep things secure. For instance, if you use a certain encryption algorithm (Course 5) to encrypt data sent between **clients** and a server on your application, keeping this algorithm secret should not be your only defense. A defense method should be so **secure** that even if someone finds out what it is, they would not be able to exploit it.

Going back to the previous example, a **proxy** server (Course 10) can be added to check that messages are unaltered before sending them to the recipient to avoid interception attacks. This makes it so that even if an attacker knew the encryption algorithm and **altered** messages, a proxy server would still catch the alterations. Although you should not rely on security by obscurity, that does not mean you should **reveal** all of your security defenses anyways!

## Separation of Concerns:

Separation of concerns in cybersecurity means giving different people working on a system **different** tasks. No person should be working on any additional tasks outside their role, this helps with organization as well as preventing users from **tampering** with other parts of a system that could result in a security incident, whether intentional or unintentional.

## Least Privilege:

The concept of **least** privilege refers to giving users the bare minimum permissions they need to complete their tasks. There is no reason for anyone to be running commands or accessing things that are unrelated to their job. Minimizing the permissions people have **lessen** the amount of mistakes that can be made or the chances of an insider attack.
