const next_course = document.querySelector(".next_course");
const exitButton = document.querySelector(".exit-button");
const popUp = document.querySelector(".pop-up");
const section = document.querySelector(".section");

function openPopupDialog() {
  if (popUp) {
    popUp.classList.add("active");
    popUp.style.opacity = "1";
  }
}

function closePopupDialog() {
  if (popUp) {
    popUp.classList.remove("active");
    popUp.style.opacity = "0";
  }
}

if (next_course) {
  next_course.addEventListener("click", openPopupDialog);
}

if (exitButton) {
  exitButton.addEventListener("click", closePopupDialog);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Esc") {
    closePopupDialog();
  }
});
