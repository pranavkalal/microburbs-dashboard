(() => {
  const backBtn = document.getElementById("backBtn");
  const addressEl = document.getElementById("detailAddress");
  const priceEl = document.getElementById("detailPrice");
  const badgesEl = document.getElementById("detailBadges");
  const metaEl = document.getElementById("detailMeta");
  const descriptionEl = document.getElementById("detailDescription");
  const attributesTable = document.querySelector("#detailAttributes table tbody");
  const attributesWrapper = document.getElementById("detailAttributes");

  const currencyFormatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });

  const numberFormatter = new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 2,
  });

  const pickKey = (obj, candidates = []) => {
    if (!obj || typeof obj !== "object") {
      return null;
    }
    const keys = Object.keys(obj);
    for (const candidate of candidates) {
      const match = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
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
    return path.split(".").reduce((acc, segment) => {
      if (!acc || typeof acc !== "object") {
        return undefined;
      }
      const key = pickKey(acc, [segment]);
      return key ? acc[key] : undefined;
    }, obj);
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
      for (const key of ["amount", "value", "price", "median", "average", "avg"]) {
        if (key in value) {
          const nested = toNumber(value[key], seen);
          if (nested != null) {
            return nested;
          }
        }
      }
      for (const nestedValue of Object.values(value)) {
        const resolved = toNumber(nestedValue, seen);
        if (resolved != null) {
          return resolved;
        }
      }
    }
    return null;
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
      const key = pickKey(value, ["full", "formatted", "display", "line1", "street", "address", "name"]);
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

  const formatSize = (raw) => {
    if (raw == null || raw === "") {
      return null;
    }
    const numeric = toNumber(raw);
    if (numeric != null) {
      if (typeof raw === "string" && raw.toLowerCase().includes("ha")) {
        return `${numberFormatter.format(numeric)} ha`;
      }
      if (typeof raw === "string" && raw.toLowerCase().includes("acre")) {
        return `${numberFormatter.format(numeric)} acres`;
      }
      return `${numberFormatter.format(numeric)} m²`;
    }
    return toText(raw);
  };

  const getStoredProperty = () => {
    const urlData = new URLSearchParams(window.location.search).get("data");
    if (urlData) {
      try {
        return JSON.parse(decodeURIComponent(urlData));
      } catch (error) {
        console.warn("Unable to parse property data from query string.", error);
      }
    }
    try {
      const localValue = localStorage.getItem("selectedProperty");
      if (localValue) {
        return JSON.parse(localValue);
      }
    } catch (error) {
      console.warn("Unable to parse property data from local storage.", error);
    }
    try {
      const sessionValue = sessionStorage.getItem("selectedProperty");
      return sessionValue ? JSON.parse(sessionValue) : null;
    } catch (error) {
      console.warn("Unable to parse property data from session storage.", error);
    }
    return null;
  };

  const renderBadges = (property) => {
    badgesEl.innerHTML = "";
    const badgeData = [
      {
        label: "Type",
        value: toText(resolve(property, "property_type")) || toText(resolve(property, "attributes.property_type")) || "—",
        className: "bg-dark",
      },
      {
        label: "Bedrooms",
        value: toNumber(resolve(property, "attributes.bedrooms")) ?? toNumber(resolve(property, "bedrooms")) ?? "—",
        className: "bg-primary",
      },
      {
        label: "Bathrooms",
        value: toNumber(resolve(property, "attributes.bathrooms")) ?? toNumber(resolve(property, "bathrooms")) ?? "—",
        className: "bg-info text-dark",
      },
      {
        label: "Land",
        value: formatSize(resolve(property, "attributes.land_size") ?? resolve(property, "land_size")) ?? "—",
        className: "bg-success",
      },
      {
        label: "Garages",
        value: toNumber(resolve(property, "attributes.garage_spaces")) ?? toNumber(resolve(property, "garage_spaces")) ?? "—",
        className: "bg-secondary",
      },
      {
        label: "Listing Date",
        value: formatDate(resolve(property, "listing_date") ?? resolve(property, "attributes.listing_date")) ?? "—",
        className: "bg-warning text-dark",
      },
    ];

    badgeData.forEach((badge) => {
      const badgeEl = document.createElement("span");
      badgeEl.className = `badge badge-pill ${badge.className}`;
      badgeEl.textContent = `${badge.label}: ${badge.value}`;
      badgesEl.append(badgeEl);
    });
  };

  const renderMeta = (property) => {
    const parts = [];
    const areaName = toText(resolve(property, "area_name"));
    const suburb = toText(resolve(property, "address.sal"));
    const state = toText(resolve(property, "address.state"));
    const coordinates = resolve(property, "coordinates");

    if (areaName) {
      parts.push(`<span class="d-inline-block me-3"><strong>Area:</strong> ${areaName}</span>`);
    } else if (suburb || state) {
      parts.push(`<span class="d-inline-block me-3"><strong>Location:</strong> ${[suburb, state].filter(Boolean).join(", ")}</span>`);
    }
    if (coordinates && typeof coordinates === "object") {
      const lat = toNumber(coordinates.latitude);
      const lng = toNumber(coordinates.longitude);
      if (lat != null && lng != null) {
        parts.push(
          `<span class="d-inline-block me-3"><strong>Coords:</strong> ${numberFormatter.format(lat)}, ${numberFormatter.format(
            lng
          )}</span>`
        );
      }
    }
    metaEl.innerHTML = parts.join(" ") || "—";
  };

  const renderDescription = (property) => {
    descriptionEl.innerHTML = "";
    const description =
      toText(resolve(property, "attributes.description")) || toText(resolve(property, "description"));
    if (!description) {
      descriptionEl.innerHTML = "<p class='text-muted mb-0'>Description unavailable.</p>";
      return;
    }
    description
      .split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        const p = document.createElement("p");
        p.textContent = paragraph.replace(/\n+/g, " ");
        descriptionEl.append(p);
      });
  };

  const renderAttributes = (property) => {
    attributesTable.innerHTML = "";
    attributesWrapper.classList.add("d-none");
    const attributes = resolve(property, "attributes");
    if (!attributes || typeof attributes !== "object") {
      return;
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
      return;
    }
    entries.forEach(([key, value]) => {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "text-muted fw-normal text-uppercase small";
      labelCell.textContent = key.replace(/[_-]+/g, " ");
      const valueCell = document.createElement("td");
      valueCell.className = "text-break";
      valueCell.textContent = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
      row.append(labelCell, valueCell);
      attributesTable.append(row);
    });
    attributesWrapper.classList.remove("d-none");
  };

  const populateDetail = (property) => {
    if (!property) {
      addressEl.textContent = "Property not found";
      priceEl.textContent = "Unable to load property details.";
      badgesEl.innerHTML = "";
      metaEl.textContent = "";
      descriptionEl.innerHTML =
        "<p class='text-muted mb-0'>Navigate back to the search page and open a property again.</p>";
      attributesWrapper.classList.add("d-none");
      return;
    }

    const priceValue = toNumber(resolve(property, "price")) ?? toNumber(resolve(property, "attributes.price"));
    const priceText = priceValue != null ? currencyFormatter.format(priceValue) : "Price unavailable";

    addressEl.textContent =
      toText(resolve(property, "address.street")) ||
      toText(resolve(property, "address.full")) ||
      toText(resolve(property, "area_name")) ||
      "Property";
    priceEl.textContent = priceText;

    renderBadges(property);
    renderMeta(property);
    renderDescription(property);
    renderAttributes(property);
  };

  backBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  });

  try {
    const property = getStoredProperty();
    populateDetail(property);
  } catch (error) {
    console.error("Failed to render property detail page.", error);
  }
})();
