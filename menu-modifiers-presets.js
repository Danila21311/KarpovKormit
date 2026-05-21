/**
 * Пресеты модификаторов по названию блюда (как в Яндекс Еде).
 * Используется на сервере (require) и в браузере (window.getMenuModifiersForItem).
 */
(function defineMenuModifiersPresets(root) {
  const BURGER_EXTRAS = {
    id: "extras",
    title: "Дополнительно",
    min: 0,
    max: 5,
    options: [
      { id: "extra-bacon", name: "Бекон", price: 50 },
      { id: "extra-onion", name: "Лук фри", price: 40 },
      { id: "extra-sriracha", name: "Соус Шрирача", price: 40 },
      { id: "extra-tomato", name: "Помидор", price: 45 },
      { id: "extra-jalapeno", name: "Перец халапеньо", price: 45 }
    ]
  };

  const PELMENI_SIDES = {
    id: "pelmeni-sides",
    title: "К пельменям",
    min: 0,
    max: 4,
    options: [
      { id: "pel-sour-cream", name: "Сметана 50 г", price: 75 },
      { id: "pel-mushroom-sauce", name: "Соус грибной 50 г", price: 75 },
      { id: "pel-horseradish", name: "Хреновина 50 г", price: 75 },
      { id: "pel-mushrooms", name: "Грибы жареные 50 г", price: 90 }
    ]
  };

  const PATTY_BEEF = {
    id: "patty-size",
    title: "Размер на выбор",
    min: 0,
    max: 2,
    options: [
      { id: "patty-beef-2", name: "Две котлеты из говядины", price: 150 },
      { id: "patty-beef-3", name: "Три котлеты из говядины", price: 300 }
    ]
  };

  const PATTY_CHICKEN = {
    id: "patty-size",
    title: "Размер на выбор",
    min: 0,
    max: 2,
    options: [
      { id: "patty-chicken-2", name: "Две котлеты из цыпленка", price: 150 },
      { id: "patty-chicken-3", name: "Три котлеты из цыпленка", price: 300 }
    ]
  };

  function cloneGroup(group) {
    return {
      id: group.id,
      title: group.title,
      min: group.min,
      max: group.max,
      options: group.options.map((option) => ({ ...option }))
    };
  }

  function getMenuModifiersForItem(name) {
    const normalized = String(name || "").toLowerCase().replace(/ё/g, "е");

    if (normalized.includes("пельмен")) {
      return [cloneGroup(PELMENI_SIDES)];
    }

    if (normalized.includes("смэш") && normalized.includes("бургер") && normalized.includes("говядин")) {
      return [cloneGroup(PATTY_BEEF), cloneGroup(BURGER_EXTRAS)];
    }

    if (
      normalized.includes("смэш") &&
      normalized.includes("бургер") &&
      (normalized.includes("цыплен") || normalized.includes("куриц"))
    ) {
      return [cloneGroup(PATTY_CHICKEN), cloneGroup(BURGER_EXTRAS)];
    }

    if (normalized.includes("сэндвич") && normalized.includes("дымн")) {
      return [cloneGroup(BURGER_EXTRAS)];
    }

    return [];
  }

  const api = { getMenuModifiersForItem };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.getMenuModifiersForItem = getMenuModifiersForItem;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
