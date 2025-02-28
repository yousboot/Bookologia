document.addEventListener("DOMContentLoaded", function () {
  const userSession = localStorage.getItem("userSession");

  if (!userSession) {
    // Redirect to welcome page if the user is not logged in
    window.location.href = "/welcome";
    return;
  }
});

// Format author name
document.addEventListener("DOMContentLoaded", () => {
  const p = document.getElementById("author-section");
  if (p) {
    let txt = p.textContent.replace("Author:", "").trim();
    let name = txt.split(".")[1].replace(/_/g, " ");
    name = name
      .split(" ")
      .map((word) =>
        word.length === 1 && !word.endsWith(".") ? word + "." : word
      )
      .join(" ");
    p.innerHTML = `<span class="font-authorname -mt-1 text-gray-500">${name}</span>`;
  }
});

// Convert date
document.addEventListener("DOMContentLoaded", () => {
  const p = document.getElementById("publication-date");
  if (p) {
    let ts = p.textContent.replace("Published:", "").trim();
    let date = new Date(parseInt(ts));
    p.innerHTML = `<strong class="opacity-30 text-gray-700">Published &nbsp; &nbsp; &nbsp;</strong> <span class="opacity-70 font-authorname">${date.toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "long", year: "numeric" }
    )}</span>`;
  }
});

// Similar books
document.addEventListener("DOMContentLoaded", function () {
  const similarBooksContainer = document
    .getElementById("similar-books")
    .querySelector("div");

  function fetchSimilarBooks(bookId) {
    axios
      .get(`/similar/${bookId}`)
      .then((response) => {
        if (
          !response.data ||
          response.data.error ||
          response.data.length === 0
        ) {
          console.warn(`No similar books found for ID: ${bookId}`);
          return;
        }
        displaySimilarBooks(response.data, similarBooksContainer);
      })
      .catch((error) => console.error("Error fetching similar books:", error));
  }

  function displaySimilarBooks(bookData, container) {
    container.innerHTML = "";

    bookData.forEach((book) => {
      const bookId = book._id;
      if (!bookId) {
        console.warn("Invalid book data:", book);
        return;
      }

      axios
        .get(`/book/${bookId}`)
        .then((response) => {
          const bookDetails = response.data;
          if (!bookDetails || bookDetails.error) {
            console.warn(`Book details not found for ID: ${bookId}`);
            return;
          }

          renderBook(bookDetails, container);
        })
        .catch((error) =>
          console.error(`Error fetching book ${bookId}:`, error)
        );
    });
  }

  function renderBook(book, container) {
    let coverUrl = book.link || "/static/images/nobook.jpg";
    const title = book.title || "Unknown Title";
    const authorName = book.author_id
      ? formatAuthorName(book.author_id)
      : "Unknown Author";

    const truncatedTitle =
      title.length > 15 ? title.substring(0, 14) + "..." : title;
    const truncatedAuthor =
      authorName.length > 15 ? authorName.substring(0, 12) + "..." : authorName;

    const bookDiv = document.createElement("div");
    bookDiv.classList.add(
      "bookshelfSimilar",
      "flex",
      "flex-col",
      "justify-end"
    );

    if (
      coverUrl ===
      "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
    ) {
      coverUrl = "/static/images/nobook.jpg";
    }

    bookDiv.innerHTML = `
      <div class="bookSimilar w-full">
        <div class="coverSimilar">
          <img src="${coverUrl}" alt="${title}" class="w-full h-full object-cover">
        </div>
        <a class="linkSimilar" href="/bookPage/${book.book_id}"></a>
      </div>
      <div class="text-left mt-4 flex flex-col gap-[0.5px] whitespace-nowrap">
        <span class="text-xs inline-flex font-cover-title">${truncatedTitle}</span>
        <span class="text-xs opacity-60 font-cover-author inline-flex ">${truncatedAuthor}</span>
      </div>
    `;

    container.appendChild(bookDiv);

    // Pop up
    const popup = document.createElement("div");
    popup.classList.add(
      "book-popup",
      "absolute",
      "hidden",
      "bg-white",
      "px-6",
      "py-6",
      "shadow-lg",
      "rounded-xl",
      "w-72",
      "text-sm"
    );
    popup.innerHTML = `
        <strong class="font-cover-title text-md">${title}</strong><br>
        <span class="opacity-60 font-cover-author text-md">${authorName}</span><br><br>
        

        <span class="">${
          book.description
            ? book.description.substring(0, 300) + "..."
            : "No description available"
        }</span><br><br>
          ${
            book.num_pages
              ? `<span class="bg-gray-800 text-white rounded-full text-xs px-2 py-1 font-cover-author mb-4">${book.num_pages} pages</span>`
              : ""
          }

      `;
    document.body.appendChild(popup);

    bookDiv.addEventListener("mouseover", (event) => {
      popup.style.left = `${event.pageX + 10}px`;
      popup.style.top = `${event.pageY + 10}px`;
      popup.classList.remove("hidden");
    });

    bookDiv.addEventListener("mousemove", (event) => {
      popup.style.left = `${event.pageX + 10}px`;
      popup.style.top = `${event.pageY + 10}px`;
    });

    bookDiv.addEventListener("mouseleave", () => {
      popup.classList.add("hidden");
    });
  }

  function formatAuthorName(authorId) {
    return authorId.split(".")[1]?.replace(/_/g, " ") || "Unknown Author";
  }

  const currentBookId = document.body.getAttribute("data-book-id");
  if (currentBookId) {
    fetchSimilarBooks(currentBookId);
  }
});

// Get links
document.addEventListener("DOMContentLoaded", () => {
  const bookId = document.body.dataset.bookId;
  const checkLinksBtn = document.getElementById("check-links-btn");
  const modal = document.getElementById("links-modal");
  const closeModal = document.getElementById("close-modal");
  const linksList = document.getElementById("links-list");

  checkLinksBtn.addEventListener("click", async () => {
    linksList.innerHTML =
      '<div class="flex justify-center items-center"><img src="/static/icons/Loading-icon.gif" alt="Loading..." class="w-40 py-10"></div>'; // Show loading GIF
    modal.classList.remove("hidden");
    try {
      const response = await fetch(`/book/pdf-search/${bookId}`);
      const data = await response.json();
      linksList.innerHTML = "";

      if (data.links?.length) {
        data.links.forEach((linkData) => {
          const linkContainer = document.createElement("div");
          linkContainer.classList.add(
            "bg-gray-100",
            "rounded-xl",
            "text-gray-700",
            "hover:bg-gray-200",
            "cursor-pointer",
            "flex",
            "flex-row",
            "items-center",
            "justify-between",
            "text-sm",
            "py-2",
            "px-4",
            "mx-10",
            "mb-2"
          );

          const displayText =
            linkData.url.length > 25
              ? linkData.url.substring(0, 22) + "..."
              : linkData.url;

          const linkElement = document.createElement("a");
          linkElement.href = linkData.url;
          linkElement.textContent = displayText;
          linkElement.target = "_blank";
          linkElement.classList.add(
            "text-blue-600",
            "text-start",
            "justify-start"
          );

          const pdfBadge = document.createElement("div");
          pdfBadge.textContent = linkData.is_pdf ? "PDF" : "Not PDF";
          pdfBadge.classList.add(
            "px-3",
            "py-1",
            "text-white",
            "rounded-full",
            "text-xs",
            linkData.is_pdf ? "bg-red-500" : "bg-gray-400"
          );

          const rightContainer = document.createElement("div");
          rightContainer.classList.add("flex", "flex-row", "items-end");
          rightContainer.appendChild(pdfBadge);

          linkContainer.appendChild(linkElement);
          linkContainer.appendChild(rightContainer);
          linksList.appendChild(linkContainer);
        });
      } else {
        linksList.innerHTML = "<div>No links found.</div>";
      }
    } catch (error) {
      console.error("Error fetching links:", error);
      linksList.innerHTML =
        "<div>An error occurred while fetching links.</div>"; // Display an error message
    }
  });

  closeModal.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
});

// Add / remove book from collection
document.addEventListener("DOMContentLoaded", async () => {
  const bookId = document.body.dataset.bookId;
  const coverDiv = document.querySelector(".bookmarkContainer");

  const response = await fetch(`/collections/book/${bookId}`);
  const { inCollection, collectionId } = await response.json();

  const button = document.createElement("button");
  button.id = "collection-btn";

  const img = document.createElement("img");
  img.src = inCollection
    ? "/static/icons/bookmark-full.svg"
    : "/static/icons/bookmark-empty.svg";
  img.classList.add(
    "w-8",
    "h-8",
    "ml-1",
    "-mt-4",
    "opacity-60",
    "hover:opacity-80"
  );

  button.appendChild(img);
  coverDiv.appendChild(button);

  button.addEventListener("click", async () => {
    if (img.src.includes("bookmark-empty")) {
      await addToCollection(bookId, img);
    } else {
      await removeFromCollection(bookId, collectionId, img);
    }
  });
});

async function removeFromCollection(bookId, collectionId, img) {
  if (!collectionId) return;
  try {
    await fetch(`/collection/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, bookId }),
    });
    img.src = "/static/icons/bookmark-empty.svg";
  } catch (error) {
    console.error("Error removing book from collection:", error);
  }
}

async function addToCollection(bookId, img) {
  try {
    const response = await fetch("/collections");
    const collections = await response.json();
    showCollectionPopup(collections, bookId, img);
  } catch (error) {
    console.error("Error fetching collections:", error);
  }
}

function showCollectionPopup(collections, bookId, img) {
  const popup = document.createElement("div");
  popup.classList.add(
    "fixed",
    "inset-0",
    "bg-gray-800",
    "bg-opacity-50",
    "flex",
    "items-center",
    "justify-center",
    "z-50"
  );
  popup.innerHTML = `
    <div class="bg-white p-6 rounded-xl shadow-lg w-3/4 max-w-lg">
      <div class="flex flex-col items-center justify-center gap-3 py-8 pb-16">
          <img
            src="/static/icons/bookmark-full-black.svg"
            alt="bookmarks"
            class="w-14 h-14 opacity-70"
          />
          <span class="text-2xl font-bold opacity-70">Collections</span>
      </div>
      <ul id="collection-list" class="list-none mx-10">
        ${collections
          .map(
            (col) =>
              `<li class="py-2 px-4 cursor-pointer text-sm mb-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl" data-name="${col.name}" data-id="${col.id}">
                  <div>${col.name}</div>
                 
          </li>`
          )
          .join("")}
      </ul>
      <div class="flex flex-col gap-3 items-center pt-16 py-8 justify-center">
        <button id="validate-popup" class="px-20 py-2 bookolor-5 font-bold text-md text-white rounded-full">Ok, add it!</button>
        <button id="cancel-popup" class="px-4 text-sm text-gray-500 hover:text-gray-800">No, cancel.</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  let selectedCollection = null;

  document.querySelectorAll("#collection-list li").forEach((li) => {
    li.addEventListener("click", () => {
      document.querySelectorAll("#collection-list li").forEach((el) => {
        el.classList.remove("bg-gray-200", "text-gray-800");
        el.innerHTML = `<div>${el.dataset.name}</div>`; // Remove check icon from others
      });

      li.classList.add("bg-gray-200", "text-gray-800");
      selectedCollection = li.dataset.id;

      // Add check icon to the selected element
      li.innerHTML = `
        <div class="flex justify-between items-center w-full">
          <div>${li.dataset.name}</div>
          <img src="/static/icons/check.svg" alt="check" class="w-4 h-4 opacity-70"/>
        </div>
      `;
    });
  });

  document.getElementById("cancel-popup").addEventListener("click", () => {
    document.body.removeChild(popup);
  });

  document
    .getElementById("validate-popup")
    .addEventListener("click", async () => {
      if (!selectedCollection) return;
      try {
        await fetch("/collection/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId: selectedCollection, bookId }),
        });
        document.body.removeChild(popup);
        img.src = "/static/icons/bookmark-full.svg";
      } catch (error) {
        console.error("Error adding book to collection:", error);
      }
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const bookCover = document.querySelector(".bigcover img");

  if (bookCover) {
    if (
      bookCover.src ===
      "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
    ) {
      bookCover.src = "/static/images/nobook.jpg";
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const bookId = document.body.dataset.bookId;
  const likeBtn = document.getElementById("like-btn");
  const likeImg = likeBtn.querySelector("img");

  async function fetchLikedStatus() {
    try {
      const response = await fetch(`/book/${bookId}`);
      const data = await response.json();
      updateLikeUI(data.userRating || 0);
    } catch (error) {
      console.error("Error fetching book like status:", error);
    }
  }

  function updateLikeUI(isLiked) {
    likeImg.src = isLiked
      ? "/static/icons/heart-full-red.svg"
      : "/static/icons/heart-empty.svg";
  }

  async function toggleLike() {
    try {
      const isCurrentlyLiked = likeImg.src.includes("heart-full-red");
      const apiUrl = isCurrentlyLiked ? "/book/unlike" : "/book/like";

      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
        credentials: "include", // Ensure cookies (session) are sent
      });

      updateLikeUI(!isCurrentlyLiked);
    } catch (error) {
      console.error("Error updating book like status:", error);
    }
  }

  likeBtn.addEventListener("click", toggleLike);
  fetchLikedStatus();
});

document.addEventListener("DOMContentLoaded", () => {
  const shortDesc = document.getElementById("short-desc");
  const fullDesc = document.getElementById("full-desc");
  const toggleBtn = document.getElementById("toggle-desc");

  if (!shortDesc || !fullDesc || !toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    if (fullDesc.classList.contains("hidden")) {
      shortDesc.style.display = "none";
      fullDesc.classList.remove("hidden");
      toggleBtn.textContent = "Show less";
    } else {
      shortDesc.style.display = "inline";
      fullDesc.classList.add("hidden");
      toggleBtn.textContent = "Show more";
    }
  });
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    document.getElementById("check-links-btn")?.click();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "a") {
    e.preventDefault();
    document.getElementById("collection-btn")?.click();
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const editionsContainer = document
    .getElementById("more-editions")
    .querySelector("div");

  function fetchEditions(bookId) {
    axios
      .get(`/book/editions/${bookId}`)
      .then((response) => {
        if (!response.data || response.data.length === 0) {
          console.warn(`No editions found for ID: ${bookId}`);
          return;
        }
        displayEditions(response.data, editionsContainer);
      })
      .catch((error) => console.error("Error fetching book editions:", error));
  }

  function displayEditions(editionIds, container) {
    container.innerHTML = "";

    editionIds.forEach((editionId) => {
      axios
        .get(`/book/${editionId}`)
        .then((response) => {
          const edition = response.data;
          if (!edition || edition.error) return;

          renderEdition(edition, container);
        })
        .catch((error) =>
          console.error(`Error fetching edition ${editionId}:`, error)
        );
    });
  }

  function renderEdition(edition, container) {
    let coverUrl = edition.link || "/static/images/nobook.jpg";
    const title = edition.title || "Unknown Title";
    const truncatedTitle =
      title.length > 15 ? title.substring(0, 14) + "..." : title;

    const editionDiv = document.createElement("div");
    editionDiv.classList.add(
      "bookshelfSimilar",
      "flex",
      "flex-col",
      "justify-end"
    );

    if (
      coverUrl ===
      "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
    ) {
      coverUrl = "/static/images/nobook.jpg";
    }

    editionDiv.innerHTML = `
      <div class="bookSimilar w-full">
        <div class="coverSimilar">
          <img src="${coverUrl}" alt="${title}" class="w-full h-full object-cover">
        </div>
        <a class="linkSimilar" href="/bookPage/${edition.book_id}"></a>
      </div>
      <div class="text-left mt-4 flex flex-col gap-[0.5px] whitespace-nowrap">
        <span class="text-xs inline-flex font-cover-title">${truncatedTitle}</span>
      </div>
    `;

    container.appendChild(editionDiv);
  }

  const currentBookId = document.body.getAttribute("data-book-id");
  if (currentBookId) {
    fetchEditions(currentBookId);
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const moreEditionsSection = document.getElementById("more-editions");
  const editionsContainer = document.getElementById("editions-container");

  moreEditionsSection.addEventListener("click", function () {
    editionsContainer.classList.toggle("hidden");
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const authorBooksSection = document.getElementById("same-author-books");
  const authorBooksContainer = document.getElementById(
    "author-books-container"
  );

  authorBooksSection.addEventListener("click", function () {
    authorBooksContainer.classList.toggle("hidden");
  });

  function fetchSameAuthorBooks(bookId) {
    axios
      .get(`/book/same-author/${bookId}`)
      .then((response) => {
        if (!response.data || response.data.length === 0) {
          console.warn(`No books found from the same author for ID: ${bookId}`);
          return;
        }
        displaySameAuthorBooks(response.data, authorBooksContainer);
      })
      .catch((error) =>
        console.error("Error fetching books from the same author:", error)
      );
  }

  function displaySameAuthorBooks(bookIds, container) {
    container.innerHTML = "";

    bookIds.forEach((bookId) => {
      axios
        .get(`/book/${bookId}`)
        .then((response) => {
          const book = response.data;
          if (!book || book.error) return;
          renderSameAuthorBook(book, container);
        })
        .catch((error) =>
          console.error(`Error fetching book ${bookId}:`, error)
        );
    });
  }

  function renderSameAuthorBook(book, container) {
    let coverUrl = book.link || "/static/images/nobook.jpg";
    const title = book.title || "Unknown Title";
    const truncatedTitle =
      title.length > 15 ? title.substring(0, 14) + "..." : title;

    const bookDiv = document.createElement("div");
    bookDiv.classList.add(
      "bookshelfSimilar",
      "flex",
      "flex-col",
      "justify-end"
    );

    if (
      coverUrl ===
      "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
    ) {
      coverUrl = "/static/images/nobook.jpg";
    }

    bookDiv.innerHTML = `
      <div class="bookSimilar w-full">
        <div class="coverSimilar">
          <img src="${coverUrl}" alt="${title}" class="w-full h-full object-cover">
        </div>
        <a class="linkSimilar" href="/bookPage/${book.book_id}"></a>
      </div>
      <div class="text-left mt-4 flex flex-col gap-[0.5px] whitespace-nowrap">
        <span class="text-xs inline-flex font-cover-title">${truncatedTitle}</span>
      </div>
    `;

    container.appendChild(bookDiv);
  }

  const currentBookId = document.body.getAttribute("data-book-id");
  if (currentBookId) {
    fetchSameAuthorBooks(currentBookId);
  }
});

document.addEventListener("DOMContentLoaded", function () {
  showSection("similar-books");
  document.getElementById("btn-similar").addEventListener("click", function () {
    showSection("similar-books");
  });
  document
    .getElementById("btn-editions")
    .addEventListener("click", function () {
      showSection("more-editions");
    });
  document.getElementById("btn-author").addEventListener("click", function () {
    showSection("same-author-books");
  });

  function showSection(sectionId) {
    const buttons = {
      "similar-books": "btn-similar",
      "more-editions": "btn-editions",
      "same-author-books": "btn-author",
    };
    Object.values(buttons).forEach((id) => {
      document
        .getElementById(id)
        .classList.remove("bg-gray-300", "text-opacity-80");
      document
        .getElementById(id)
        .classList.add("bg-gray-200", "text-opacity-50");
    });
    document
      .getElementById(buttons[sectionId])
      .classList.add("bg-gray-300", "text-opacity-80");
    const sections = ["similar-books", "more-editions", "same-author-books"];
    sections.forEach((id) => {
      document.getElementById(id).classList.add("hidden");
    });
    document.getElementById(sectionId).classList.remove("hidden");
  }
});
