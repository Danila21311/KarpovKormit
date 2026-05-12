async function hydrateDeliveryContent() {
  const article = document.getElementById("delivery-article");
  if (!article) return;
  try {
    const response = await fetch("/api/delivery-content", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.ok || typeof data.contentHtml !== "string" || !data.contentHtml.trim()) return;
    article.innerHTML = data.contentHtml;
  } catch (_) {
    // fallback to static HTML from delivery.html
  }
}

hydrateDeliveryContent();
