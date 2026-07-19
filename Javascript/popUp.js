const nextButton = document.querySelector('.next-button');
const exitButton = document.querySelector('.exit-button');
const nextCourse = document.querySelector('.next_course');
const popUp = document.querySelector('.pop-up');

function openPopup() {
    if (popUp) {
        popUp.classList.add('active');
    }
}

function closePopupDialog() {
    if (popUp) {
        popUp.classList.remove('active');
    }
}

if (nextCourse) {
    nextCourse.addEventListener('click', openPopup);
}

if (nextButton) {
    nextButton.addEventListener('click', openPopup);
}

if (exitButton) {
    exitButton.addEventListener('click', closePopupDialog);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
        closePopupDialog();
    }
});