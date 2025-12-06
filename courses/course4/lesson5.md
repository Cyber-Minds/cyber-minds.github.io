# Lesson 5: Automation with Python

In **Cybersecurity**, understanding the status of a website or web service is crucial.

We will **develop** a Python script to determine the status of a website **without** directly accessing it over the internet. This approach will minimize potential attack vectors and increase online security.

## Hints:

## Install the requests library

1. Open your terminal or command prompt and run the following command to install the requests library: **pip install requests**

## Ask for the website URL the user wants to check:

2. User Input: The script prompts the user to enter the URL they want to check. Ensure you input a valid URL starting with **"http://"** or **"https://"**.

## Use the Method from the Library:

3. HTTP GET Request: The **requests.get()** function is used to send an HTTP GET request to the provided URL.

## Status Code:

4. Response Status Code: The HTTP response status code is printed to indicate the status of the website. A status code of **200-299** typically means success. A status code of **400-499** means Client error. A status code of **500-599** means Server error.
