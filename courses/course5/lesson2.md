# Lesson 2: Private & Public Key Encryption

## Public vs. Private Key Cryptography

## Basic Terms of Cryptography:

- **Plaintext:** original text, unencrypted
- **Ciphertext:** encrypted text
- **Key:** a piece of information used to encode and decode messages

## Private Key Cryptography:

Private key algorithms, also known as symmetric algorithms, use the same key for encryption and decryption. Although it is faster and takes up less storage to save only one key, it is less secure. This key is also known as a **private key** and it known between the parties of communication. If an attacker were to get a hold of the key, entire **systems** using a symmetric algorithm could be at risk.

## Symmetric Encryption Algorithms:

- **CC** - Caesar Cipher
- **VC** - Vigenere Cipher
- **AES** - Advanced Encryption Standard
- **DES** - Data Encryption Standard

## The Caesar Cipher (Example):

The Caesar Cipher got its name from being created around the time of Caesar. It is one of the earliest forms of **encryption** and was used by Caesar to send messages to his military. It is also quite basic, here is how it works:

- **Plaintext:** hello world
- **Key:** 5
- **Ciphertext:** mjqqt btwqi

Just from this information, you might be able to see how this cipher works. The key, which is an **integer**, represents how many letters in the alphabet the original message should be shifted by.

## Public Key Cryptography:

Public key algorithms are also called asymmetric algorithms, they use **one key** for encryption and a different key for decryption. Each party in an asymmetric algorithm has a public key and a private key. Public key algorithms take up more space and are slower, but they are definitely more secure. They are developed using some **complex** math... we will go over an example of how one of the algorithms work, but for a start, here is a general example.

## General Example:

1. Alice wants to send Bob a message with asymmetric encryption.

2. Alice uses **Bob's public key** to encrypt her message as she sends it to Bob

3. Bob receives the encrypted message and uses **Bob's private key** to decrypt it.

4. Bob wants to send a message back, he encrypts it with **Alice's public key**.

5. Alice receives the message and uses **Alice's private key** to decrypt it.

To remember this, you can use the analogy of a **mailbox**. Messages are sent and encrypted using the recipient's public key, similar to how you can put mail in a recipient's mailbox, which is available to everyone. Messages are **decrypted** using the recipient's own private key, similar to how the recipient is the only one that has the key to their own mailbox. When the mail is in the mailbox, it is equivalent to a message being in the state of **encryption**.

**Video Resource:** [https://www.youtube.com/embed/AQDCe585Lnc?t=77s](https://www.youtube.com/embed/AQDCe585Lnc?t=77s)
*Video Credit: Simply Explained on Youtube*

## Symmetric Encryption Algorithms:

- Rivest-Shamir-Adleman (RSA)
- Diffie-Hellman
- Elliptic Curve Cryptography (ECC)

## RSA Algorithm (Example):

If you have been wondering how the use of more than one key can result in the same message, this **RSA** may help you understand more. This example will use small numbers for simplicity. But in the real world, **RSA** relies on incredibly large prime numbers and the fact that they are difficult to compute, even for computers.

## RSA Encoding Process:

1. **Choose two large prime numbers, p and q:**
   We are going to use two small ones, 5 and 7.

2. **The public key consists of two parts: integer n and integer e. The n value equals p times q.**
   - n = p*q
   - n = 5*7 = 35

3. **The e value must also be an integer, but not a factor of phi of n (Φ(n) = (p-1)(q-1)).**
   - Φ(n) = (p-1)(q-1)
   - Φ(n) = (5-1)(7-1) = (4)(6) = 24
   - e = 5

4. **Now we must create our private key, d. The d value uses the previously generated values, (d*e)%Φ must be equal to 1.**
   - (d*e)%Φ = 1
   - (5*5)%24 = 1
   - d = 5

5. **We will now use our generated values to encrypt our plaintext (a). Ciphertext (c) = (a^e)%n**
   - c = (a^e)%n
   - H: c = (8^5)%35 = 8
   - I: c = (9^5)%35 = 4
   - **Note:** Try to use a programming or scientific calculator if you are unable to find modulo on a standard calculator.
   - **Note 2:** the ciphertext for the letter H ended up the same as the plaintext for this example. This is just a coincidence and it does not always happen.
   - The cipher text for the word "HI" using our keys is 8 4

6. **We will decrypt the message. The equation for this is: (a) = (c^d)%n**
   - a = (c^e)%n
   - H: a = (8^5)%35 = 8
   - I: a = (4^5)%35 = 9

That was definitely a lot, but we successfully used a public key to encrypt and a private key to decrypt, and we got the same message! This example used a lot of smaller numbers for the sake of simplicity, so there were a lot of repeating numbers. The **point** is, the **math** checks out so that even when you use a different key to decrypt, you will end up with the same plaintext. Feel free to try this with larger numbers, and you will get more realistic examples of how this works. There are also plenty of resources online that can explain the **algorithm**, walkthroughs and calculators for **RSA**, and other information on this and other ciphers! Additionally, understanding the **process** and the underlying **principles** is crucial for mastering RSA.
