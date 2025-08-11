<script>
  import logoUrl from '../../assets/logo.svg?url';
  import DropdownIcon from '../../assets/dropdown.svg?component';
</script>

<header class="site-header">
  <div class="header-content">
    <img src={logoUrl} alt="AirViz Logo" class="logo" />
    <nav>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
        <li class="dropdown">
          <a href="/data">
            Data <DropdownIcon class="dropdown-icon" />
          </a>
          <ul class="dropdown-content">
            <li><a href="/data/overview">Overview</a></li>
            <li><a href="/data/map">Map</a></li>
          </ul>
        </li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
  </div>
</header>
