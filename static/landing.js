function selectRole(role) {
      if (role === 'user') {
        window.location.href = "/user";   // change route
      } else {
        window.location.href = "/seller"; // change route
      }
    }
    