const c11div = document.querySelector('.c11trigger');
const c12div = document.querySelector('.c12trigger');
const exitButton = document.querySelector('.exit-button');
const popUp = document.querySelector('.pop-up');

function openPopupDialog() {
    if (popUp) {
        popUp.classList.add('active');
    }
}

function closePopupDialog() {
    if (popUp) {
        popUp.classList.remove('active');
    }
}

if (c11div) {
    c11div.addEventListener('click', openPopupDialog);
}

if (c12div) {
    c12div.addEventListener('click', openPopupDialog);
}

if (exitButton) {
    exitButton.addEventListener('click', closePopupDialog);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
        closePopupDialog();
    }
});
