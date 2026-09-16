/* ============================================================
   PICKIT LANDING PAGE
============================================================ */


/*
 * USER FLOW
 *
 * Existing user:
 *     /user/<userId>
 *
 * New user:
 *     /login/user
 *
 *
 * SELLER FLOW
 *
 * Seller:
 *     /login/seller
 *
 */


function selectRole(role) {

    /* ========================================================
       CUSTOMER
    ========================================================= */

    if (role === "user") {

        const userId =
            localStorage.getItem("userId");


        /*
         * Existing customer
         */

        if (userId) {

            window.location.href =
                `/user/${userId}`;

        }


        /*
         * New customer
         */

        else {

            window.location.href =
                "/login/user";

        }

        return;
    }



    /* ========================================================
       SELLER
    ========================================================= */

    if (role === "seller") {

        /*
         * Keep seller login separate from the
         * customer experience.
         */

        window.location.href =
            "/login/seller";

        return;
    }

}



/* ============================================================
   SMALL PAGE ENHANCEMENT
============================================================ */


/*
 * If the user already has a session, change the navbar
 * button from "Sign in" to "Open Pickit".
 */

document.addEventListener("DOMContentLoaded", () => {

    const userId =
        localStorage.getItem("userId");


    const signInButton =
        document.querySelector(".signin-button");


    if (userId && signInButton) {

        signInButton.textContent =
            "Open Pickit";

    }

});
