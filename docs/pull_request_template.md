gh issue edit 147 --repo woonetwork/woofi_swap_smart_contracts --add-label "merge"https://github.com/woonetwork/woofi_swap_smart_contracts/issues/147 Creating pull request
Completed with input: {
      "head": "assign_reviewer",
        "headOwner": "gbr-na",
          "repo": {
                "name": "woofi_swap_smart_contracts",
                    "owner": "woonetwork"
          },
            "title": "Fix: theft of unclaimed yield"
}

Ran terminal command:  gh pr create --repo woonetwork/woofi_swap_smart_contracts --head gbr-na:assign_reviewer --title "Fix: theft of unclaimed yield" --body "Closes #1

Screenshots:
![Screenshot 1](https://bugs.immunefi.com/api/attachments/report/84853/c56c4498-3ec1-4805-878b-08c14840a8a9/Screenshot_20260309_152449_Samsung%20Internet.jpg)
![Screenshot 2](https://bugs.immunefi.com/api/attachments/report/84853/946ea8e7-4908-4f94-bde0-fa12734baad6/Screenshot_20260309_161905_Samsung%20Internet.jpg)"https://github.com/gbr-na/-assign_reviewer-immunefi/issues/1. revertp521.ts)‎

Original file line numberDiff line numberDiff line change

@@ -0,0 +1,9 @@

1+

gh pr create --repo woonetwork/woofi_swap_smart_contracts --head gbr-na:assign_reviewer --title "Fix: theft of unclaimed yield" --body "Closes #147

2+

3+

Reproduces and fixes the theft of unclaimed yield vulnerability reported in Immunefi report #68586.

4+

5+

Screenshots:

6+

![Screenshot 1](https://bugs.immunefi.com/api/attachments/report/84853/c56c4498-3ec1-4805-878b-08c14840a8a9/Screenshot_20260309_152449_Samsung%20Internet.jpg)

7+

![Screenshot 2](https://bugs.immunefi.com/api/attachments/report/84853/946ea8e7-4908-4f94-bde0-fa12734baad6/Screenshot_20260309_161905_Samsung%20Internet.jpg

merge-  --reproduce ## Sample Pull Request Template Description

This is a sample pull request template. You can customize it to fit your project's needs.

Don't forget to commit your template file to the repository so that it can be used for future pull requests!
