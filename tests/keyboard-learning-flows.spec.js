// @ts-check
/* eslint-disable no-await-in-loop -- real keyboard events must run in order. */
const { test, expect } = require('@playwright/test');

const QUIZ_PATH =
  '/HTML/Courses and Activities/Course 3/AttacksQuizcourse3.html';
const ACTIVITY_PATH =
  '/HTML/Courses and Activities/Course 12/EmergingTechActivitycourse12.html';

async function tabTo(page, locator, description) {
  for (let index = 0; index < 100; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab order did not reach ${description}`);
}

async function expectVisibleRadioFocus(radio, description) {
  const label = radio.locator('xpath=following-sibling::label');
  await expect(radio, `${description}: radio should have keyboard focus`).toBeFocused();
  await expect
    .poll(
      () => label.evaluate((element) => getComputedStyle(element).outlineWidth),
      { message: `${description}: focused answer must show a visible outline` }
    )
    .toBe('3px');
}

async function expectVisibleButtonFocus(button, description) {
  await expect(button, `${description}: control should have keyboard focus`).toBeFocused();
  const hasVisibleFocus = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
      style.boxShadow !== 'none'
    );
  });
  expect(hasVisibleFocus, `${description}: focused control must show a visible indicator`).toBe(
    true
  );
}

async function testKeyboardQuiz(page, path, title, answers) {
  await page.goto(path);
  const firstQuestion = page.locator('input[name="q1"]').first();
  await tabTo(page, firstQuestion, `${title} question 1`);
  await expectVisibleRadioFocus(firstQuestion, `${title} question 1`);
  await expect(firstQuestion).toHaveAccessibleName(/.+/);
  await expect(firstQuestion).toHaveAttribute('aria-required', 'true');

  const questionStops = [
    [page.locator('input[name="q2"]').first(), `${title} question 2`],
    [page.locator('input[name="q3"]').first(), `${title} question 3`],
    [page.locator('input[name="q4"]').first(), `${title} question 4`],
    [page.getByRole('button', { name: /submit/i }), `${title} submit control`],
  ];

  for (const [stop, description] of questionStops) {
    await page.keyboard.press('Tab');
    await expect(stop, `Tab order on ${title} should reach ${description}`).toBeFocused();
  }

  await page.keyboard.press('Enter');
  const result = page.getByRole('status');
  await expect(result).toHaveText(
    'Please answer every question before submitting. Question 1 needs an answer.'
  );
  await expect(page.locator('input[name="q1"]').first()).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expectVisibleRadioFocus(firstQuestion, `${title} validation recovery`);

  for (const [index, value] of answers.entries()) {
    const radio = page.locator(`input[name="q${index + 1}"][value="${value}"]`);
    const firstOption = page.locator(`input[name="q${index + 1}"]`).first();
    const selectedIndex = await radio.evaluate((element) =>
      [...document.querySelectorAll(`input[name="${element.name}"]`)].indexOf(
        element
      )
    );
    expect(
      selectedIndex,
      `${title} question ${index + 1}: expected keyboard-selectable answer "${value}"`
    ).toBeGreaterThanOrEqual(0);

    if (index > 0) {
      await page.keyboard.press('Tab');
      await expect(firstOption, `${title} question ${index + 1}: Tab should advance`).toBeFocused();
    }
    for (let step = 0; step < selectedIndex; step += 1) {
      await page.keyboard.press('ArrowDown');
    }
    if (selectedIndex === 0) {
      await page.keyboard.press('Space');
    }

    await expect(radio, `${title} question ${index + 1}: keyboard answer selection`).toBeChecked();
    await expect(radio).toHaveAccessibleName(/.+/);
  }

  await page.keyboard.press('Tab');
  const submit = page.getByRole('button', { name: /submit/i });
  await expectVisibleButtonFocus(
    submit,
    `${title}: Tab should reach submission after the last answer`
  );
  await page.keyboard.press('Enter');

  await expect(result).toHaveText(`Your score is: ${answers.length}/${answers.length}`);
  await expect(result).toHaveAttribute('aria-live', 'polite');
  await expect(result).toHaveAttribute('role', 'status');

  const retry = page.getByRole('button', { name: 'Retry Quiz' });
  await expectVisibleButtonFocus(retry, `${title}: completion should focus the retry control`);
  for (const [index, value] of answers.entries()) {
    const selectedAnswer = page.locator(
      `input[name="q${index + 1}"][value="${value}"]`
    );
    const label = selectedAnswer.locator('xpath=following-sibling::label');
    await expect(label, `${title} question ${index + 1}: correct feedback`).toHaveClass(
      /is-correct/
    );
    await expect(
      label.locator('.answer-detail'),
      `${title} question ${index + 1}: answer explanation`
    ).toBeVisible();
  }

  await page.keyboard.press('Enter');
  await expect(submit, `${title}: retry should return focus to submission`).toBeFocused();
  await expect(result).toHaveText('');
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
}

test('Course 3 quiz is keyboard-operable with validation at a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await testKeyboardQuiz(page, QUIZ_PATH, 'Course 3 Attacks Quiz', [
    'VS',
    'verify',
    'true',
    'tail',
  ]);
});

test('Course 12 activity is keyboard-operable with validation at desktop width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await testKeyboardQuiz(page, ACTIVITY_PATH, 'Course 12 Emerging Tech Activity', [
    'untrusted',
    'change-creds',
    'false',
    'custody',
  ]);
});
