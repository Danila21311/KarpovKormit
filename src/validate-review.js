function validateReviewPayload(body) {
  const errors = [];
  const authorName = String(body?.authorName || body?.name || "").trim();
  const text = String(body?.text || body?.reviewText || "").trim();
  const rating = Number(body?.rating);

  if (authorName.length < 2) {
    errors.push("Укажите имя (минимум 2 символа).");
  } else if (authorName.length > 80) {
    errors.push("Имя слишком длинное (максимум 80 символов).");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push("Выберите оценку от 1 до 5 звёзд.");
  }

  if (text.length < 20) {
    errors.push("Текст отзыва — минимум 20 символов.");
  } else if (text.length > 2000) {
    errors.push("Текст отзыва — максимум 2000 символов.");
  }

  if (!body?.consent) {
    errors.push("Подтвердите согласие на обработку данных.");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      authorName,
      rating,
      text
    }
  };
}

module.exports = { validateReviewPayload };
