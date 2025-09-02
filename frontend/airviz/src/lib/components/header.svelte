<script lang="ts">
  import logoUrl from '../../assets/logo.svg?url';
  import DropdownIcon from '../../assets/dropdown.svg?component';
</script>

<header class="site-header">
  <div class="header-content">
    <img src={logoUrl} alt="AirViz Logo" class="logo" />
    <nav>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/#/about">About</a></li>
        <li class="dropdown">
          <a href="/data">
            Data <DropdownIcon class="dropdown-icon" />
          </a>
          <ul class="dropdown-content">
            <li><a href="/#/map">Map</a></li>
            <li><a href="/#/aggregate-map">Aggregate Map</a></li>
          </ul>
        </li>
        <li><a href="/#/contact">Contact</a></li>
      </ul>
    </nav>
  </div>
</header>
