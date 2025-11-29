const nextButton = document.querySelector('.next-button');
const exitButton = document.querySelector('.exit-button');
const nextCourse = document.querySelector('.next_course');
const popUp = document.querySelector('.pop-up');

nextCourse.addEventListener('click', () => {
    popUp.classList.toggle('active');
});

nextButton.addEventListener('click', () => {
    popUp.classList.toggle('active');
});

exitButton.addEventListener('click', () => {
    popUp.classList.toggle('active');
});