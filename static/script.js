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
  const modalEl = document.getElementById("propertyModal");
  const modalTitleEl = document.getElementById("propertyModalTitle");
  const modalSubtitleEl = document.getElementById("propertyModalSubtitle");
  const modalMetricsEl = document.getElementById("propertyModalMetrics");
  const modalDescriptionEl = document.getElementById("propertyModalDescription");
  const modalMetaEl = document.getElementById("propertyModalMeta");
  const modalRawAttributesEl = document.getElementById("propertyModalRawAttributes");
  const modalLinkEl = document.getElementById("propertyModalLink");
  let currentResults = [];
  let visibleResults = [];
  let modalInstance;

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

  const ensureModal = () => {
    if (!modalInstance) {
      modalInstance = new bootstrap.Modal(modalEl);
    }
    return modalInstance;
  };

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
    visibleResults = [];
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
    "attributes.bedrooms",
    "attributes.beds",
    "details.bedrooms",
    "metrics.bedrooms",
  ];

  const BATHROOM_KEYS = [
    "bathrooms",
    "baths",
    "bathroom",
    "attributes.bathrooms",
    "attributes.baths",
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
    visibleResults = items.slice(0, 12);

    const fragment = document.createDocumentFragment();
    visibleResults.forEach((item, index) => {
      const col = document.createElement("div");
      col.className = "col";

      const address = extractAddress(item);
      const priceValue = extractPrice(item);
      const bedrooms = extractBedrooms(item);
      const bathrooms = extractBathrooms(item);
      const priceText =
        priceValue != null ? currencyFormatter.format(priceValue) : "Price unavailable";
      const bedsText = bedrooms ?? "—";
      const bathsText = bathrooms ?? "—";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "property-card card h-100 text-start w-100";
      button.innerHTML = `
        <div class="card-body d-flex flex-column gap-2">
          <h5 class="card-title mb-1">${address}</h5>
          <span class="price-chip align-self-start">${priceText}</span>
          <div class="property-meta-row text-muted d-flex gap-3">
            <span>Beds: <strong>${bedsText}</strong></span>
            <span>Baths: <strong>${bathsText}</strong></span>
          </div>
        </div>
      `;
      button.onclick = () => openDetail(item);

      col.append(button);
      fragment.append(col);
    });

    cardsEl.append(fragment);
  };

  const formatDate = (value) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(parsed);
  };

  const DESCRIPTION_KEYS = ["attributes.description", "description"];
  const PROPERTY_TYPE_KEYS = ["property_type", "attributes.property_type", "type"];
  const LISTING_DATE_KEYS = ["listing_date", "listed_at", "date"];
  const GARAGE_KEYS = [
    "attributes.garage_spaces",
    "garage_spaces",
    "car_spaces",
    "carports",
    "parking",
  ];
  const LAND_SIZE_KEYS = ["attributes.land_size", "land_size", "lot_size"];
  const BUILDING_SIZE_KEYS = ["attributes.building_size", "building_size"];
  const AREA_NAME_KEYS = ["area_name", "address.full", "address.display"];

  const formatSizeText = (raw) => {
    if (raw == null || raw === "") {
      return null;
    }
    if (typeof raw === "number") {
      return `${numberFormatter.format(raw)} m²`;
    }
    const numeric = toNumber(raw);
    if (numeric != null) {
      if (typeof raw === "string" && raw.toLowerCase().includes("ha")) {
        return `${numberFormatter.format(numeric)} ha`;
      }
      if (typeof raw === "string" && raw.toLowerCase().includes("acre")) {
        return `${numberFormatter.format(numeric)} acres`;
      }
      if (typeof raw === "string" && raw.toLowerCase().includes("m")) {
        return `${numberFormatter.format(numeric)} m²`;
      }
      return numberFormatter.format(numeric);
    }
    return toText(raw);
  };

  const setDescriptionContent = (container, description) => {
    container.innerHTML = "";
    if (!description) {
      return;
    }
    const heading = document.createElement("h6");
    heading.className = "fw-semibold mb-2";
    heading.textContent = "Description";
    container.append(heading);

    description
      .split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        const p = document.createElement("p");
        p.className = "mb-2";
        p.textContent = paragraph.replace(/\n+/g, " ");
        container.append(p);
      });
  };

  const setMetricsContent = (container, metrics) => {
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();
    metrics
      .filter((metric) => metric && metric.value != null && metric.value !== "")
      .forEach((metric) => {
        const col = document.createElement("div");
        col.className = "col-sm-6";
        col.innerHTML = `
          <div class="modal-metrics-tile">
            <div class="modal-metrics-label">${metric.label}</div>
            <div class="modal-metrics-value">${metric.value}</div>
          </div>
        `;
        fragment.append(col);
      });
    if (!fragment.children.length) {
      container.classList.add("d-none");
    } else {
      container.classList.remove("d-none");
      container.append(fragment);
    }
  };

  const setMetaContent = (container, metaItems) => {
    container.innerHTML = "";
    const filtered = metaItems.filter(
      (item) => item && item.value != null && item.value !== ""
    );
    if (!filtered.length) {
      container.classList.add("d-none");
      return;
    }
    container.classList.remove("d-none");
    const snippet = filtered
      .map((item) => `<span class="me-3"><strong>${item.label}:</strong> ${item.value}</span>`)
      .join("");
    container.innerHTML = snippet;
  };

  const createRawAttributesHtml = (attributes) => {
    if (!attributes || typeof attributes !== "object") {
      return "";
    }
    const entries = Object.entries(attributes).filter(([key, value]) => {
      if (typeof key === "string" && key.toLowerCase() === "description") {
        return false;
      }
      if (value == null || value === "") {
        return false;
      }
      if (typeof value === "object" && !Object.keys(value).length) {
        return false;
      }
      return true;
    });
    if (!entries.length) {
      return "";
    }
    const rows = entries
      .map(([key, value]) => {
        const displayKey = key
          .replace(/[_-]+/g, " ")
          .replace(/(^\w|\s\w)/g, (s) => s.toUpperCase());
        const displayValue =
          typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
        return `
          <tr>
            <th scope="row" class="text-muted fw-normal">${displayKey}</th>
            <td class="text-break">${displayValue}</td>
          </tr>
        `;
      })
      .join("");
    return `
      <h6 class="fw-semibold mb-2">Additional Attributes</h6>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  const openPropertyModal = (item) => {
    if (!item) {
      return;
    }

    try {
      sessionStorage.setItem("selectedProperty", JSON.stringify(item));
    } catch (error) {
      console.warn("Unable to persist selected property to session storage.", error);
    }

    const address = extractAddress(item);
    const areaName = toText(extractFirst(item, AREA_NAME_KEYS));
    const priceValue = extractPrice(item);
    const priceText = priceValue != null ? currencyFormatter.format(priceValue) : null;
    const bedrooms = extractBedrooms(item);
    const bathrooms = extractBathrooms(item);
    const propertyTypeValue = extractFirst(item, PROPERTY_TYPE_KEYS);
    const propertyTypeText = toText(propertyTypeValue);
    const listingDateRaw = extractFirst(item, LISTING_DATE_KEYS);
    const listingDateText = formatDate(listingDateRaw);
    const garageRaw = extractFirst(item, GARAGE_KEYS);
    const garageValue = toNumber(garageRaw);
    const garageText =
      garageValue != null ? numberFormatter.format(garageValue) : toText(garageRaw);
    const landRaw = extractFirst(item, LAND_SIZE_KEYS);
    const landText = formatSizeText(landRaw);
    const buildingRaw = extractFirst(item, BUILDING_SIZE_KEYS);
    const buildingText = formatSizeText(buildingRaw);
    const descriptionRaw = toText(extractFirst(item, DESCRIPTION_KEYS));

    const latitude = toNumber(resolve(item, "coordinates.latitude"));
    const longitude = toNumber(resolve(item, "coordinates.longitude"));

    modalTitleEl.textContent = address;
    modalSubtitleEl.textContent = areaName || "";

    setMetaContent(modalMetaEl, [
      { label: "Listing Date", value: listingDateText },
      { label: "Latitude", value: latitude != null ? numberFormatter.format(latitude) : null },
      {
        label: "Longitude",
        value: longitude != null ? numberFormatter.format(longitude) : null,
      },
    ]);

    setMetricsContent(modalMetricsEl, [
      { label: "Price", value: priceText },
      { label: "Bedrooms", value: bedrooms ?? "—" },
      { label: "Bathrooms", value: bathrooms ?? "—" },
      { label: "Garage Spaces", value: garageText ?? "—" },
      { label: "Land Size", value: landText ?? "—" },
      { label: "Building Size", value: buildingText ?? "—" },
      { label: "Property Type", value: propertyTypeText ?? "—" },
    ]);

    setDescriptionContent(modalDescriptionEl, descriptionRaw);

    const attributesHtml = createRawAttributesHtml(resolve(item, "attributes"));
    modalRawAttributesEl.innerHTML = attributesHtml;
    modalRawAttributesEl.classList.toggle("d-none", !attributesHtml);

    try {
      const encoded = encodeURIComponent(JSON.stringify(item));
      modalLinkEl.href = `/property?data=${encoded}`;
    } catch (error) {
      modalLinkEl.href = "/property";
    }

    ensureModal().show();
  };

  const openDetail = (item) => {
    if (!item) {
      return;
    }
    try {
      localStorage.setItem("selectedProperty", JSON.stringify(item));
    } catch (error) {
      console.warn("Unable to persist property to local storage.", error);
    }
    window.location.href = "/property";
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
