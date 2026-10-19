---
title: Protect your data
summary: Back up your shop's records to a private GitHub repository, and move to a new computer if you ever need to.
minutes: 15
---
Your customers, tickets and payments are your business. This page makes sure a broken or stolen computer never costs you any of it.

## How your records are stored

Every change you make, such as a new customer, a diagnosis or a payment, is saved on your computer and added to a private history in the same moment. You do not press a save button. The history lives in a folder called `shop` inside your Auto Center data folder, which by default is `~/.config/robos/auto-center`. Only your own user can read it.

That history is a normal **Git repository**. Git is the same tool programmers use to keep every version of their work. You do not need to learn it. It means your history can be copied to GitHub as a backup.

## Set up your backup

1. Create a free account at github.com if you do not have one.
2. Create a new repository and choose **Private**. Name it something like `your-shop-records`. Never make it public, because it will hold customer names and phone numbers.
3. Install the GitHub command line tool (`gh`) on the shop computer and sign in with `gh auth login`. Auto Center uses it to check that your repository really is private.
4. In Auto Center open **Admin**, then **Backup**.
5. Enter your repository as `your-account/your-shop-records` and press **Connect**.
6. Press **Back up now**.

::shot[see-whether-your-records-are-backed-up|2|The Backup tab before a repository is connected]

The banner changes from *Not backed up yet* to *Backed up to https://github.com/…*. If the repository is not private, or the name is wrong, Auto Center refuses to connect and tells you why.

::shot[see-whether-your-records-are-backed-up|4|A repository name that is not valid is refused]

> **Make it a habit.** Pressing **Back up now** is manual. Do it at closing time every day. Anything you did since the last backup exists only on the shop computer.

> **Privacy.** A private GitHub repository is still stored on GitHub's servers. Check that keeping customer names, phone numbers and vehicle details there is acceptable under the rules where you operate.

## Move to a new computer

If the shop computer dies, you can get everything back from your backup. This was tested with a copy of a real shop.

1. Install Auto Center on the new computer and open it once, then close it.
2. In a terminal, copy your backup into the data folder:

   ```
   mkdir -p ~/.config/robos/auto-center
   git clone https://github.com/your-account/your-shop-records.git ~/.config/robos/auto-center/shop
   ```
3. Open Auto Center, set **Workspace** to **Maintenance center**, and open **Admin**, then **Customers**. Your customers, tickets and team are back.

The new computer is already connected to the same backup, so **Back up now** works straight away.

## You are ready when

- [ ] **Admin**, **Backup** shows *Backed up to* your private repository
- [ ] You have a reminder to back up at closing time
- [ ] You know where the restore steps are

Next: [Run the shop day to day](../8-run-the-shop/).
