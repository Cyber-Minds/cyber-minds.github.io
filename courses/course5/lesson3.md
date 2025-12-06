# Lesson 3: Hashing

Hashing is **one-way encryption.** Once you have encrypted your plaintext, it cannot be decrypted. Obviously, unlike encryption, hashing would be terrible to use for communication since recipients of messages would just be reading a bunch of ciphertext! The real use for hashing is for verifying data integrity.

An easy and applicable example of hashing relates to **passwords.** When passwords are stored, they **should always be hashed.** When you enter your password into a login page, your input will be hashed and compared to the hash in the database with all the saved passwords, the comparison will verify if you typed in the correct password. By hashing such an important credential, attackers cannot access your password if they manage to get a hold of the database (there are ways they get around this, we will talk about this in the Cryptographic Attacks article). This is a much safer option than just leaving all stored passwords in plaintext.

![Hashing for Cybersecurity](../../../Images/hashingforCybersecurity.jpg)

If you recall back in Course 1, the "I" in the CIA triad stood for integrity. Integrity in security refers to the accuracy of data and reliance on the fact that it cannot be modified. Hashing is used for this. Hashes of data are known as **checksums.** It is also important to note that a checksum is completely unique to the data it represents. As data is transmitted between different parts of a network, it is important to make sure that the data stays unmodified by accident or by attackers. At different stages during its transit, the checksum of the original data can be compared to the checksum of the data after transit (or at any other stage) in order to make sure that the data is the same. If the checksums are different, it means the data has been modified.

## Parts of a Reliable Hashing Algorithm:

- A hashing algorithm should always result in a **hash** of the same **length** as to not let the length of the checksum correlate to the data
- No two **hashes** (of different pieces of data) should be the same. A hash should always be **unique**. Should anything in the data change, the hash should come out different.
- A **hash** should not be predictable in any way that can help an attacker decipher the algorithm.
- If any one of these principles is not followed by the algorithm, it makes it **unreliable!**

## Collisions:

If two hash outputs are the same for different inputs, this is known as a collision. A collision can also refer to different people using the same credential so that there are multiple instances of a hash value in a database.

## Common Hashing Algorithms

The Secure Hashing Algorithms (SHA) are the standard hash to use today. SHA was developed by the National Institute of Standards and Technology and was made a federal standard. SHA-256 is an incredibly common algorithm, 256 representing the length of the hash in bits. However, SHA-512 has been released as well, and due to its increased length, it is a little more complex and also highly used.
