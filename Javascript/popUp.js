const nextButton = document.querySelector('.next-button');
const exitButton = document.querySelector('.exit-button');
const nextCourse = document.querySelector('.next_course');
const popUp = document.querySelector('.pop-up');

if (nextCourse && popUp) {
    nextCourse.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}

if (nextButton && popUp) {
    nextButton.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}

if (exitButton && popUp) {
    exitButton.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}
