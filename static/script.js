(() => {
  const suburbInput = document.getElementById("suburbInput");
  const fetchBtn = document.getElementById("fetchBtn");
  const clearBtn = document.getElementById("clearBtn");
  const sortAscBtn = document.getElementById("sortAsc");
  const sortDescBtn = document.getElementById("sortDesc");
  const typeSelect = document.getElementById("typeSelect");
  const summaryEl = document.getElementById("summary");
  const cardsEl = document.getElementById("cards");
  const emptyEl = document.getElementById("empty");
  const alertEl = document.getElementById("alert");
  let currentResults = [];

  const currencyFormatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });

  const normalizeList = (raw) => {
    const queue = [raw];
    const visited = new Set();

    while (queue.length) {
      const current = queue.shift();

      if (Array.isArray(current)) {
        return current;
      }

      if (!current || typeof current !== "object") {
        continue;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      ["raw", "data", "results", "properties"].forEach((key) => {
        if (key in current) {
          queue.push(current[key]);
        }
      });
    }

    return [];
  };

  const pickKey = (obj, candidates = []) => {
    if (!obj || typeof obj !== "object") {
      return null;
    }

    const keys = Object.keys(obj);
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const match = keys.find(
        (key) => key.toLowerCase() === candidate.toLowerCase()
      );
      if (match) {
        return match;
      }
    }
    return null;
  };

  const resolve = (obj, path) => {
    if (!obj || typeof obj !== "object" || typeof path !== "string") {
      return undefined;
    }

    const segments = path.split(".");
    let current = obj;

    for (const segment of segments) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      const key = pickKey(current, [segment]);
      if (!key) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  };

  const toNumber = (value, seen = new Set()) => {
    if (value == null) {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.\-]/g, "");
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        return null;
      }
      seen.add(value);

      const priorityKeys = ["amount", "value", "price", "median", "average", "avg"];
      for (const key of priorityKeys) {
        if (key in value) {
          const result = toNumber(value[key], seen);
          if (result != null) {
            return result;
          }
        }
      }

      for (const nested of Object.values(value)) {
        const result = toNumber(nested, seen);
        if (result != null) {
          return result;
        }
      }
    }

    return null;
  };

  const showAlert = (type, message) => {
    alertEl.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  };

  const hideAlert = () => {
    alertEl.innerHTML = "";
  };

  const badge = (label, value, className) =>
    `<span class="badge ${className}">${label}: ${value}</span>`;

  const renderSummary = ({ suburb, count, medianPrice, averagePrice, propertyType }) => {
    if (!suburb && !count && medianPrice == null && averagePrice == null) {
      summaryEl.innerHTML = '<span class="text-muted">Awaiting search.</span>';
      return;
    }

    const safeSuburb = suburb || "—";
    const safeCount = typeof count === "number" ? count : "0";
    const medianText =
      medianPrice != null ? currencyFormatter.format(medianPrice) : "—";
    const averageText =
      averagePrice != null ? currencyFormatter.format(averagePrice) : null;
    const typeText = propertyType ? propertyType : "Any";
    const medianBadgeText =
      averageText && medianText !== "—"
        ? `${medianText} · Avg ${averageText}`
        : medianText;

    summaryEl.innerHTML = [
      badge("Suburb", safeSuburb, "badge-ink"),
      badge("Listings", safeCount, "badge-cyan"),
      badge("Median Price", medianBadgeText, "badge-green"),
      badge("Type", typeText, "badge-dark"),
    ].join(" ");
  };

  const showSkeletons = (count = 6) => {
    cardsEl.classList.remove("d-none");
    emptyEl.classList.add("d-none");
    cardsEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const col = document.createElement("div");
      col.className = "col";
      col.innerHTML = `
        <div class="skeleton p-4">
          <div class="skeleton-line" style="width: 70%; height: 18px;"></div>
          <div class="skeleton-line" style="width: 50%;"></div>
          <div class="skeleton-line" style="width: 60%;"></div>
        </div>
      `;
      fragment.append(col);
    }
    cardsEl.append(fragment);
  };

  const clearCards = () => {
    cardsEl.innerHTML = "";
  };

  const showEmptyState = () => {
    clearCards();
    cardsEl.classList.add("d-none");
    emptyEl.classList.remove("d-none");
  };

  const hideEmptyState = () => {
    emptyEl.classList.add("d-none");
    cardsEl.classList.remove("d-none");
  };

  const toText = (value, depth = 0) => {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "object" && depth < 3) {
      const priorityKeys = ["full", "formatted", "display", "line1", "street", "address", "name"];
      const key = pickKey(value, priorityKeys);
      if (key) {
        const resolved = toText(value[key], depth + 1);
        if (resolved) {
          return resolved;
        }
      }
      const parts = Object.values(value)
        .map((part) => toText(part, depth + 1))
        .filter(Boolean);
      if (parts.length) {
        return Array.from(new Set(parts)).join(", ");
      }
    }
    return null;
  };

  const PRICE_KEYS = [
    "price",
    "listing_price",
    "sale_price",
    "median_price",
    "price.amount",
    "price.value",
    "pricing.price",
    "pricing.median",
    "metrics.price",
    "metrics.price.median",
  ];

  const ADDRESS_KEYS = [
    "address.full",
    "address.formatted",
    "address.display",
    "displayAddress",
    "fullAddress",
    "location.address",
    "streetAddress",
    "street",
    "title",
    "name",
    "property_name",
    "address",
  ];

  const BEDROOM_KEYS = [
    "bedrooms",
    "beds",
    "bedroom",
    "details.bedrooms",
    "metrics.bedrooms",
  ];

  const BATHROOM_KEYS = [
    "bathrooms",
    "baths",
    "bathroom",
    "details.bathrooms",
    "metrics.bathrooms",
  ];

  const extractFirst = (item, keys) => {
    for (const key of keys) {
      const value = resolve(item, key);
      if (value != null) {
        return value;
      }
    }
    return undefined;
  };

  const extractPrice = (item) => {
    const value = extractFirst(item, PRICE_KEYS);
    return toNumber(value);
  };

  const extractBedrooms = (item) => {
    const value = extractFirst(item, BEDROOM_KEYS);
    return toNumber(value);
  };

  const extractBathrooms = (item) => {
    const value = extractFirst(item, BATHROOM_KEYS);
    return toNumber(value);
  };

  const extractAddress = (item) => {
    const value = extractFirst(item, ADDRESS_KEYS);
    return toText(value) || "Property";
  };

  const computeMedian = (numbers) => {
    if (!numbers.length) {
      return null;
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  };

  const computeAverage = (numbers) => {
    if (!numbers.length) {
      return null;
    }
    const total = numbers.reduce((sum, value) => sum + value, 0);
    return total / numbers.length;
  };

  const renderCards = (items) => {
    hideEmptyState();
    cardsEl.innerHTML = "";

    const fragment = document.createDocumentFragment();
    items.slice(0, 12).forEach((item) => {
      const col = document.createElement("div");
      col.className = "col";

      const address = extractAddress(item);
      const priceValue = extractPrice(item);
      const bedrooms = extractBedrooms(item);
      const bathrooms = extractBathrooms(item);
      const priceText =
        priceValue != null ? currencyFormatter.format(priceValue) : "Price unavailable";

      col.innerHTML = `
        <div class="property-card card h-100">
          <div class="card-body">
            <h5 class="card-title">${address}</h5>
            <p class="card-text mb-2">${priceText}</p>
            <ul class="list-inline mb-0 small text-muted">
              <li class="list-inline-item me-3">
                <span class="fw-semibold">Beds:</span> ${bedrooms ?? "—"}
              </li>
              <li class="list-inline-item">
                <span class="fw-semibold">Baths:</span> ${bathrooms ?? "—"}
              </li>
            </ul>
          </div>
        </div>
      `;

      fragment.append(col);
    });

    cardsEl.append(fragment);
  };

  const handleSuccess = (suburb, propertyType, list) => {
    const count = list.length;
    if (!count) {
      renderSummary({
        suburb,
        count: 0,
        medianPrice: null,
        averagePrice: null,
        propertyType,
      });
      showAlert("warning", "No results found for that suburb.");
      currentResults = [];
      showEmptyState();
      return;
    }

    const prices = list
      .map((item) => extractPrice(item))
      .filter((value) => typeof value === "number");

    renderSummary({
      suburb,
      count,
      medianPrice: computeMedian(prices),
      averagePrice: computeAverage(prices),
      propertyType,
    });

    hideAlert();
    currentResults = Array.isArray(list) ? [...list] : [];
    renderCards(currentResults);
  };

  const fetchProperties = async () => {
    const suburb = suburbInput.value.trim();
    const propertyTypeValue = (typeSelect.value || "").trim();
    const propertyTypeLabel = propertyTypeValue || "Any";
    if (!suburb) {
      showAlert("warning", "Please enter a suburb before fetching data.");
      renderSummary({
        suburb: "",
        count: 0,
        medianPrice: null,
        averagePrice: null,
        propertyType: propertyTypeLabel,
      });
      cardsEl.innerHTML = "";
      return;
    }

    showAlert("info", `Loading properties for ${suburb} (Type: ${propertyTypeLabel})…`);
    renderSummary({
      suburb,
      count: 0,
      medianPrice: null,
      averagePrice: null,
      propertyType: propertyTypeLabel,
    });
    cardsEl.innerHTML = "";
    showSkeletons();

    try {
      const query = new URLSearchParams({ suburb });
      if (propertyTypeValue) {
        query.append("property_type", propertyTypeValue);
      }
      const response = await fetch(`/api/properties?${query.toString()}`);
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = errorPayload.error || `Request failed with status ${response.status}`;
        showAlert("danger", message);
        return;
      }

      const payload = await response.json();
      const list = normalizeList(payload);
      handleSuccess(suburb, propertyTypeLabel, list);
    } catch (error) {
      showAlert("danger", `Unable to fetch properties: ${error.message}`);
      clearCards();
      currentResults = [];
    }
  };

  fetchBtn.addEventListener("click", fetchProperties);
  suburbInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      fetchProperties();
    }
  });

  clearBtn.addEventListener("click", () => {
    suburbInput.value = "";
    suburbInput.focus();
  });

  const sortResults = (direction) => {
    if (!currentResults.length) {
      return;
    }
    const modifier = direction === "asc" ? 1 : -1;
    currentResults = [...currentResults].sort((a, b) => {
      const priceA = extractPrice(a);
      const priceB = extractPrice(b);
      const safeA = typeof priceA === "number" ? priceA : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const safeB = typeof priceB === "number" ? priceB : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      if (safeA === safeB) {
        return 0;
      }
      return safeA > safeB ? modifier : -modifier;
    });
    renderCards(currentResults);
  };

  sortAscBtn.addEventListener("click", () => sortResults("asc"));
  sortDescBtn.addEventListener("click", () => sortResults("desc"));

  renderSummary({
    suburb: "",
    count: 0,
    medianPrice: null,
    averagePrice: null,
    propertyType: "",
  });
})();
