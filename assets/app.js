(function(){
  'use strict';

  let wallpapers = [];
  let currentTag = 'all';
  let searchQuery = '';
  let visibleCount = 20;
  let currentLightboxIndex = 0;
  let filteredWallpapers = [];
  let imgObserver;
  let allTags = new Set();
  let lastRenderedTag = null;
  let lastRenderedSearch = '';

  // ===== Load wallpapers from JSON =====
  function loadWallpapers() {
    return fetch('./wallpapers/wallpapers.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        wallpapers = data;
        wallpapers.forEach(function(w) {
          w.tags.forEach(function(t) { allTags.add(t); });
        });
        filteredWallpapers = wallpapers.slice();
        return wallpapers;
      })
      .catch(function(err) {
        console.error('Failed to load wallpapers:', err);
        return scanWallpapersFolder();
      });
  }

  // ===== Fallback: scan wallpapers folder =====
  function scanWallpapersFolder() {
    return fetch('./wallpapers/')
      .then(function(res) { return res.text(); })
      .then(function(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var links = doc.querySelectorAll('a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".webp"]');
        var scanned = [];
        links.forEach(function(link, i) {
          var filename = link.getAttribute('href');
          var name = filename.replace(/\.[^.]+$/, '').replace(/wallpaper_\d+_?/, '').replace(/_/g, ' ');
          scanned.push({
            id: i + 1,
            src: './wallpapers/' + filename,
            title: name || '\u58c1\u7eb8 ' + (i + 1),
            tags: ['\u7cbe\u9009'],
            likes: Math.floor(Math.random() * 5000) + 500
          });
        });
        wallpapers = scanned;
        filteredWallpapers = wallpapers.slice();
        return wallpapers;
      })
      .catch(function() {
        wallpapers = [
          {id:1, src:'./wallpapers/wallpaper_01.jpg', title:'\u6a31\u82b1\u5c11\u5973', tags:['\u6e05\u7eaf','\u552f\u7f8e'], likes:2341}
        ];
        filteredWallpapers = wallpapers.slice();
        return wallpapers;
      });
  }

  // ===== Render Tags dynamically =====
  function renderTags() {
    var container = document.getElementById('tagsContainer');
    if (!container) return;
    var tagsArray = Array.from(allTags);
    var html = '<span class="tag active" data-tag="all" onclick="window.filterByTag(\'all\')">\u5168\u90e8</span>';
    tagsArray.forEach(function(tag) {
      html += '<span class="tag" data-tag="' + tag + '" onclick="window.filterByTag(\'' + tag + '\')">' + tag + '</span>';
    });
    container.innerHTML = html;
  }

  // ===== Intersection Observer for lazy loading =====
  function initLazyLoad() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('img[data-src]').forEach(function(img){ img.src = img.dataset.src; });
      return;
    }
    imgObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imgObserver.unobserve(img);
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.01 });
  }

  // ===== Responsive column count =====
  function getColumnCount() {
    var w = window.innerWidth;
    if (w >= 1100) return 4;
    if (w >= 768) return 3;
    return 2;
  }

  function updateColumns() {
    var container = document.getElementById('waterfall');
    if (container) container.style.columnCount = getColumnCount();
  }

  // ===== Create a single card DOM element =====
  function createCardElement(w, index) {
    var card = document.createElement('div');
    card.className = 'wallpaper-card';
    card.dataset.id = w.id;
    card.dataset.index = index;

    var tagsHtml = '';
    for (var j = 0; j < w.tags.length; j++) {
      tagsHtml += '<span class="card-tag">' + w.tags[j] + '</span>';
    }

    card.innerHTML =
      '<img data-src="' + w.src + '" alt="' + w.title + '" loading="lazy">' +
      '<div class="card-overlay">' +
        '<div class="card-title">' + w.title + '</div>' +
        '<div class="card-tags">' + tagsHtml + '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="card-action-btn" data-action="like" data-id="' + w.id + '" title="\u559c\u6b22">&#10084;</button>' +
        '<button class="card-action-btn" data-action="download" data-src="' + w.src + '" data-title="' + w.title + '" title="\u4e0b\u8f7d">&#11015;</button>' +
      '</div>';

    card.addEventListener('click', function(e) {
      if (e.target.closest('[data-action]')) {
        e.stopPropagation();
        var action = e.target.closest('[data-action]').dataset.action;
        if (action === 'like') window.likeWallpaper(parseInt(e.target.closest('[data-action]').dataset.id));
        if (action === 'download') window.downloadWallpaper(e.target.closest('[data-action]').dataset.src, e.target.closest('[data-action]').dataset.title);
        return;
      }
      window.openLightbox(parseInt(card.dataset.index));
    });

    return card;
  }

  // ===== Render Gallery (full re-render for tag/search changes) =====
  function renderGallery() {
    var container = document.getElementById('waterfall');
    var noResults = document.getElementById('noResults');
    var countEl = document.getElementById('galleryCount');
    var loadMoreBtn = document.querySelector('.load-more');

    filteredWallpapers = wallpapers.filter(function(w) {
      var tagMatch = currentTag === 'all' || w.tags.indexOf(currentTag) !== -1;
      var searchMatch = !searchQuery ||
        w.title.indexOf(searchQuery) !== -1 ||
        w.tags.some(function(t){ return t.indexOf(searchQuery) !== -1; });
      return tagMatch && searchMatch;
    });

    countEl.textContent = '\u5171 ' + filteredWallpapers.length + ' \u5f20';

    if (filteredWallpapers.length === 0) {
      container.innerHTML = '';
      noResults.style.display = 'block';
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      lastRenderedTag = currentTag;
      lastRenderedSearch = searchQuery;
      return;
    }

    noResults.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = '';

    // Clear and rebuild (for tag/search filter changes)
    container.innerHTML = '';

    var toShow = filteredWallpapers.slice(0, visibleCount);
    for (var i = 0; i < toShow.length; i++) {
      container.appendChild(createCardElement(toShow[i], i));
    }

    updateColumns();
    observeNewImages();

    // Update load-more button visibility
    if (loadMoreBtn) {
      loadMoreBtn.style.display = visibleCount >= filteredWallpapers.length ? 'none' : '';
    }

    lastRenderedTag = currentTag;
    lastRenderedSearch = searchQuery;
  }

  // ===== Append only new cards (for load-more, no layout jump) =====
  function appendCards() {
    var container = document.getElementById('waterfall');
    var loadMoreBtn = document.querySelector('.load-more');
    var countEl = document.getElementById('galleryCount');

    var toShow = filteredWallpapers.slice(0, visibleCount);
    var existingCount = container.children.length;

    // Only append cards that don't exist yet
    for (var i = existingCount; i < toShow.length; i++) {
      container.appendChild(createCardElement(toShow[i], i));
    }

    updateColumns();
    observeNewImages();

    // Hide button if all loaded
    if (loadMoreBtn) {
      loadMoreBtn.style.display = visibleCount >= filteredWallpapers.length ? 'none' : '';
    }
  }

  // ===== Observe new lazy images =====
  function observeNewImages() {
    if (imgObserver) {
      document.querySelectorAll('img[data-src]').forEach(function(img){
        imgObserver.observe(img);
      });
    }
  }

  // ===== Tag Filter =====
  window.filterByTag = function(tag) {
    currentTag = tag;
    visibleCount = 20;
    document.querySelectorAll('.tag').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tag === tag);
    });
    renderGallery();
  };

  // ===== Search =====
  window.handleSearch = function(e) {
    if (e.key === 'Enter') window.search();
  };

  window.search = function() {
    searchQuery = document.getElementById('searchInput').value.trim();
    visibleCount = 20;
    renderGallery();
  };

  // ===== Load More (append-only, no reflow) =====
  window.loadMore = function() {
    visibleCount += 20;
    appendCards();
  };

  // ===== Lightbox =====
  window.openLightbox = function(index) {
    currentLightboxIndex = index;
    updateLightbox();
    document.getElementById('lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.closeLightbox = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('lightbox').classList.remove('active');
    document.body.style.overflow = '';
  };

  window.navigateLightbox = function(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = filteredWallpapers.length - 1;
    if (currentLightboxIndex >= filteredWallpapers.length) currentLightboxIndex = 0;
    updateLightbox();
  };

  function updateLightbox() {
    var w = filteredWallpapers[currentLightboxIndex];
    document.getElementById('lightboxImg').src = w.src;
    document.getElementById('lightboxInfo').textContent = w.title + ' \u00b7 ' + w.tags.join(' \u00b7 ') + ' \u00b7 \u2764 ' + w.likes;
  }

  // ===== Download =====
  window.downloadWallpaper = function(src, title) {
    var a = document.createElement('a');
    a.href = src;
    a.download = '\u5fa1\u56fe\u7f51_' + title + '.jpg';
    a.click();
  };

  // ===== Like =====
  window.likeWallpaper = function(id) {
    var w = wallpapers.find(function(x){ return x.id === id; });
    if (w) { w.likes++; }
  };

  // ===== Mobile Menu =====
  window.toggleMenu = function() {
    document.getElementById('mainNav').classList.toggle('active');
  };

  // ===== Debounce utility =====
  function debounce(fn, wait) {
    var timer;
    return function() {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(null, args); }, wait);
    };
  }

  // ===== Scroll to Top (debounced) =====
  window.addEventListener('scroll', debounce(function() {
    var btn = document.getElementById('scrollTop');
    btn.classList.toggle('visible', window.scrollY > 400);
  }, 100));

  // ===== Responsive resize (debounced) =====
  window.addEventListener('resize', debounce(updateColumns, 150));

  window.scrollToTop = function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===== Keyboard Navigation =====
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('lightbox').classList.contains('active')) return;
    if (e.key === 'Escape') window.closeLightbox();
    if (e.key === 'ArrowLeft') window.navigateLightbox(-1);
    if (e.key === 'ArrowRight') window.navigateLightbox(1);
  });

  // ===== URL Tag Param =====
  function checkUrlTag() {
    var params = new URLSearchParams(window.location.search);
    var tag = params.get('tag');
    if (tag) window.filterByTag(tag);
  }

  // ===== Auto-refresh: check for new wallpapers every 30s =====
  function startAutoRefresh() {
    setInterval(function() {
      loadWallpapers().then(function() {
        renderTags();
        renderGallery();
      });
    }, 30000);
  }

  // ===== Init =====
  initLazyLoad();
  loadWallpapers().then(function() {
    renderTags();
    renderGallery();
    checkUrlTag();
    startAutoRefresh();
  });
})();
